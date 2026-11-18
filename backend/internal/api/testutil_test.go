package api_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/fifa-tournament/backend/internal/api"
	"github.com/fifa-tournament/backend/internal/auth"
	"github.com/fifa-tournament/backend/internal/config"
	"github.com/fifa-tournament/backend/internal/store"
	"github.com/fifa-tournament/backend/migrations"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

// adminURL points at a Postgres server where we may create databases. Tests
// skip when it is unreachable (e.g. `make up` is not running).
func adminURL() string {
	if v := os.Getenv("TEST_DATABASE_ADMIN_URL"); v != "" {
		return v
	}
	return "postgres://fifa:fifa@localhost:5433/postgres?sslmode=disable"
}

type env struct {
	t      *testing.T
	srv    *httptest.Server
	handle http.Handler
	db     *pgxpool.Pool
}

func (e *env) pool() *pgxpool.Pool { return e.db }

// newEnv boots the API on a fresh, migrated database with the fake Google provider.
func newEnv(t *testing.T) *env {
	t.Helper()
	ctx := context.Background()
	admin, err := pgx.Connect(ctx, adminURL())
	if err != nil {
		if os.Getenv("CI") != "" {
			t.Fatalf("postgres not available in CI: %v", err)
		}
		t.Skipf("postgres not available: %v", err)
	}
	name := fmt.Sprintf("pitch_test_%d", rand.Int63())
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+name); err != nil {
		admin.Close(ctx)
		t.Skipf("cannot create test database: %v", err)
	}
	cfgAdmin, _ := pgx.ParseConfig(adminURL())
	cfgAdmin.Database = name
	dbURL := fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=disable", cfgAdmin.User, cfgAdmin.Password, cfgAdmin.Host, cfgAdmin.Port, name)

	sqlDB, err := sql.Open("pgx", dbURL)
	if err != nil {
		t.Fatal(err)
	}
	goose.SetBaseFS(migrations.FS)
	_ = goose.SetDialect("postgres")
	goose.SetLogger(goose.NopLogger())
	if err := goose.Up(sqlDB, "."); err != nil {
		t.Fatal(err)
	}
	sqlDB.Close()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatal(err)
	}
	e := &env{t: t, db: pool}
	e.srv = httptest.NewUnstartedServer(nil)
	cfg := config.Config{
		AppEnv: "dev", FrontendOrigin: "http://localhost:5173",
		GoogleProvider: "fake",
	}
	e.srv.Start()
	cfg.PublicBaseURL = e.srv.URL
	e.handle = api.New(cfg, store.New(pool), func(context.Context) (auth.Provider, error) {
		return auth.Fake{PagePath: "/auth/google/fake"}, nil
	})
	e.srv.Config.Handler = e.handle

	t.Cleanup(func() {
		e.srv.Close()
		pool.Close()
		_, _ = admin.Exec(ctx, "DROP DATABASE IF EXISTS "+name+" WITH (FORCE)")
		admin.Close(ctx)
	})
	return e
}

// client is a browser-like HTTP client with its own cookie jar that does not
// follow redirects automatically.
type client struct {
	e *env
	c *http.Client
}

func (e *env) client() *client {
	jar, _ := cookiejar.New(nil)
	return &client{e: e, c: &http.Client{
		Jar:           jar,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

func (c *client) do(method, path string, body any, headers ...string) (*http.Response, []byte) {
	c.e.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.e.srv.URL+path, rd)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	res, err := c.c.Do(req)
	if err != nil {
		c.e.t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res, b
}

func (c *client) expect(want int, method, path string, body any) []byte {
	c.e.t.Helper()
	res, b := c.do(method, path, body)
	if res.StatusCode != want {
		c.e.t.Fatalf("%s %s: got %d want %d: %s", method, path, res.StatusCode, want, b)
	}
	return b
}

// setupAdmin runs first-run setup, leaving c signed in as the default admin.
func (c *client) setupAdmin() {
	c.e.t.Helper()
	c.expect(201, "POST", "/auth/setup", map[string]string{"password": "correct horse battery"})
}

// googleLogin signs c in through the fake provider as email and returns the
// final redirect location ("/" on success, "/login?error=..." otherwise).
func (c *client) googleLogin(email string) string {
	c.e.t.Helper()
	res, _ := c.do("GET", "/auth/google/start", nil)
	loc, _ := res.Location()
	state := loc.Query().Get("state")
	res, _ = c.do("GET", "/auth/google/callback?code="+email+"&state="+state, nil)
	if res.StatusCode != 302 {
		c.e.t.Fatalf("callback status %d", res.StatusCode)
	}
	loc, _ = res.Location()
	return loc.Path + func() string {
		if loc.RawQuery != "" {
			return "?" + loc.RawQuery
		}
		return ""
	}()
}

func decode[T any](t *testing.T, b []byte) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(b, &v); err != nil {
		t.Fatalf("decode %s: %v", b, err)
	}
	return v
}

func jsonUnmarshal(b []byte, v any) error { return json.Unmarshal(b, v) }
