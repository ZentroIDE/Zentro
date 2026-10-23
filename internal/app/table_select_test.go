// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"testing"

	"zentro/internal/core"
	msdriver "zentro/internal/driver/mssql"
	mydriver "zentro/internal/driver/mysql"
	pgdriver "zentro/internal/driver/postgres"
	sqdriver "zentro/internal/driver/sqlite"
	"zentro/internal/models"
)

func TestBuildQualifiedTableSelect_QuotesPerDriver(t *testing.T) {
	core.Register(pgdriver.New())
	core.Register(msdriver.New())
	core.Register(mydriver.New())
	core.Register(sqdriver.New())

	tests := []struct {
		name   string
		driver string
		want   string
	}{
		{"postgres uses double quotes", "postgres", `SELECT * FROM "public"."users"`},
		{"sqlserver uses double quotes", "sqlserver", `SELECT * FROM "public"."users"`},
		{"sqlite uses double quotes", "sqlite", `SELECT * FROM "public"."users"`},
		{"mysql uses backticks", "mysql", "SELECT * FROM `public`.`users`"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			seedPoolConnection(t, &models.ConnectionProfile{Name: "p1", Driver: tt.driver})
			a := &App{}
			got, err := a.BuildQualifiedTableSelect("p1", "public", "users")
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestBuildQualifiedTableSelect_UnknownProfile(t *testing.T) {
	seedPoolConnection(t)
	a := &App{}
	if _, err := a.BuildQualifiedTableSelect("nope", "public", "users"); err == nil {
		t.Fatalf("expected error for an unresolvable profile name")
	}
}
