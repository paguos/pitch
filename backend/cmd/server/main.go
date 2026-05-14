package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/fifa-tournament/backend/internal/api"
	"github.com/fifa-tournament/backend/internal/config"
	"github.com/fifa-tournament/backend/internal/store"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

func main() {
	cfg := config.FromEnv()
	ctx := context.Background()

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
	h := api.New(cfg, st)

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
	goose.SetBaseFS(nil)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	dir := "/app/migrations"
	if _, err := os.Stat(dir); err != nil {
		// fallback for local `go run`
		dir = "../db/migrations"
		if _, err := os.Stat(dir); err != nil {
			dir = "./db/migrations"
		}
	}
	return goose.Up(db, dir)
}

// ensure stdlib pgx driver registered.
var _ = stdlib.GetDefaultDriver
