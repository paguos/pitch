package main

import (
	"bufio"
	"context"
	"database/sql"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode/utf8"

	"github.com/fifa-tournament/backend/internal/api"
	"github.com/fifa-tournament/backend/internal/auth"
	"github.com/fifa-tournament/backend/internal/config"
	"github.com/fifa-tournament/backend/internal/store"
	"github.com/fifa-tournament/backend/migrations"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

func main() {
	cfg := config.FromEnv()
	ctx := context.Background()

	if len(os.Args) > 1 {
		if os.Args[1] == "reset-admin-password" {
			resetAdminPassword(ctx, cfg)
			return
		}
		log.Fatalf("unknown command %q (known: reset-admin-password)", os.Args[1])
	}

	if err := runMigrations(cfg.DatabaseURL); err != nil {
		log.Fatalf("migrations: %v", err)
	}

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("db ping: %v", err)
	}

	st := store.New(pool)
	h := api.New(cfg, st, newProviderFunc(cfg))

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           h,
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		log.Printf("listening on :%s (env=%s)", cfg.Port, cfg.AppEnv)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Println("shutting down")
	ctx2, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx2)
}

// resetAdminPassword reads the new password from NEW_ADMIN_PASSWORD (or the
// first line of stdin) and replaces the default admin's password:
//
//	docker compose exec -e NEW_ADMIN_PASSWORD=... backend /app/server reset-admin-password
func resetAdminPassword(ctx context.Context, cfg config.Config) {
	pw := os.Getenv("NEW_ADMIN_PASSWORD")
	if pw == "" {
		line, _ := bufio.NewReader(os.Stdin).ReadString('\n')
		pw = strings.TrimRight(line, "\r\n")
	}
	if utf8.RuneCountInString(pw) < auth.MinPasswordLen {
		log.Fatalf("password must be at least %d characters (set NEW_ADMIN_PASSWORD or pipe it on stdin)", auth.MinPasswordLen)
	}
	hash, err := auth.HashPassword(pw)
	if err != nil {
		log.Fatalf("hash: %v", err)
	}
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()
	switch err := store.New(pool).ResetAdminPassword(ctx, hash); {
	case errors.Is(err, store.ErrNotFound):
		log.Fatalf("no admin account yet: open the app and complete first-run setup instead")
	case err != nil:
		log.Fatalf("reset: %v", err)
	}
	log.Println("admin password updated; existing admin sessions were ended")
}

// newProviderFunc returns the Google sign-in provider factory, or nil when
// Google is not configured (the default admin can still sign in). The real
// provider is built lazily, so a Google outage at boot doesn't stop the app,
// and is retried on the next sign-in attempt if discovery failed.
func newProviderFunc(cfg config.Config) func(context.Context) (auth.Provider, error) {
	if cfg.GoogleProvider == "fake" {
		if !cfg.IsDev() {
			log.Fatalf("GOOGLE_PROVIDER=fake is only allowed with APP_ENV=dev")
		}
		log.Printf("WARNING: using the fake Google provider (dev only)")
		return func(context.Context) (auth.Provider, error) {
			return auth.Fake{PagePath: "/api/auth/google/fake"}, nil
		}
	}
	if cfg.GoogleClientID == "" || cfg.GoogleClientSecret == "" {
		log.Printf("Google sign-in disabled: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set")
		return nil
	}
	var (
		mu sync.Mutex
		g  *auth.Google
	)
	return func(ctx context.Context) (auth.Provider, error) {
		mu.Lock()
		defer mu.Unlock()
		if g != nil {
			return g, nil
		}
		ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		p, err := auth.NewGoogle(ctx, cfg.GoogleClientID, cfg.GoogleClientSecret, cfg.GoogleRedirectURL())
		if err != nil {
			return nil, err
		}
		g = p
		return g, nil
	}
}

func runMigrations(dbURL string) error {
	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		return err
	}
	defer db.Close()
	// Retry briefly in case the DB is not quite ready.
	deadline := time.Now().Add(30 * time.Second)
	for {
		if err := db.Ping(); err == nil {
			break
		}
		if time.Now().After(deadline) {
			return err
		}
		time.Sleep(time.Second)
	}
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	return goose.Up(db, ".")
}

// ensure stdlib pgx driver registered.
var _ = stdlib.GetDefaultDriver
