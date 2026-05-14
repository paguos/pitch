package config

import "os"

type Config struct {
	AppEnv         string
	DatabaseURL    string
	Port           string
	FrontendOrigin string
}

func FromEnv() Config {
	return Config{
		AppEnv:         getenv("APP_ENV", "dev"),
		DatabaseURL:    getenv("DATABASE_URL", "postgres://fifa:fifa@localhost:5433/fifa?sslmode=disable"),
		Port:           getenv("PORT", "8080"),
		FrontendOrigin: getenv("FRONTEND_ORIGIN", "http://localhost:5173"),
	}
}

func getenv(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func (c Config) IsDev() bool { return c.AppEnv == "dev" }
