package main

import (
	"testing"

	"github.com/fifa-tournament/backend/internal/config"
)

func TestDevAdminPassword(t *testing.T) {
	cases := []struct {
		name    string
		cfg     config.Config
		want    string
		wantErr bool
	}{
		{"unset", config.Config{AppEnv: "dev"}, "", false},
		{"unset in prod", config.Config{AppEnv: "prod"}, "", false},
		{"dev", config.Config{AppEnv: "dev", DevAdminPassword: "admin-dev-only"}, "admin-dev-only", false},
		{"refused outside dev", config.Config{AppEnv: "prod", DevAdminPassword: "admin-dev-only"}, "", true},
		{"too short", config.Config{AppEnv: "dev", DevAdminPassword: "short"}, "", true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, err := devAdminPassword(c.cfg)
			if (err != nil) != c.wantErr || got != c.want {
				t.Fatalf("got (%q, %v), want (%q, err=%v)", got, err, c.want, c.wantErr)
			}
		})
	}
}
