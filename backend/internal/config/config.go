package config

import (
	"os"
	"strings"
)

type Config struct {
	AppEnv         string
	DatabaseURL    string
	Port           string
	FrontendOrigin string

	// PublicBaseURL is the externally visible origin of the app (where the
	// browser loads the SPA), e.g. https://pitch.example.ts.net. The API is
	// served under /api on it. Used for the Google redirect URI, cookie
	// security and the CSRF origin check.
	PublicBaseURL      string
	GoogleClientID     string
	GoogleClientSecret string
	// GoogleProvider is "google" (default) or "fake" (dev only).
	GoogleProvider string
	// DevAdminPassword, when set (dev only), creates the default admin with
	// this password at boot if no admin exists yet, so a fresh local database
	// skips the first-run setup screen. The server refuses to start with it
	// set outside APP_ENV=dev.
	DevAdminPassword string
}

func FromEnv() Config {
	return Config{
		AppEnv:         getenv("APP_ENV", "dev"),
		DatabaseURL:    getenv("DATABASE_URL", "postgres://fifa:fifa@localhost:5433/fifa?sslmode=disable"),
		Port:           getenv("PORT", "8080"),
		FrontendOrigin: getenv("FRONTEND_ORIGIN", "http://localhost:5173"),

		PublicBaseURL:      strings.TrimRight(getenv("PUBLIC_BASE_URL", "http://localhost:5173"), "/"),
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		GoogleProvider:     getenv("GOOGLE_PROVIDER", "google"),
		DevAdminPassword:   os.Getenv("DEV_ADMIN_PASSWORD"),
	}
}

func getenv(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func (c Config) IsDev() bool { return c.AppEnv == "dev" }

// SecureCookies is true when the app is served over https.
func (c Config) SecureCookies() bool { return strings.HasPrefix(c.PublicBaseURL, "https://") }

// GoogleRedirectURL is the callback registered with Google. nginx serves the
// API under /api in front of the backend.
func (c Config) GoogleRedirectURL() string { return c.PublicBaseURL + "/api/auth/google/callback" }
