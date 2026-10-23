// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"crypto/tls"
	"testing"

	"zentro/internal/models"
)

func testProfile(sslMode string) *models.ConnectionProfile {
	return &models.ConnectionProfile{
		Host: "db.example", Port: 3306, Username: "u", Password: "p", DBName: "d", SSLMode: sslMode,
	}
}

func TestBuildConfigPlaintextForDisableAndEmpty(t *testing.T) {
	for _, mode := range []string{"", "disable"} {
		cfg, err := buildConfig(testProfile(mode))
		if err != nil {
			t.Fatal(err)
		}
		if cfg.TLS != nil {
			t.Errorf("sslmode %q must stay plaintext", mode)
		}
	}
}

func TestBuildConfigRequireEncryptsWithoutVerify(t *testing.T) {
	cfg, err := buildConfig(testProfile("require"))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.TLS == nil || !cfg.TLS.InsecureSkipVerify {
		t.Fatalf("require must encrypt without verifying, got %+v", cfg.TLS)
	}
}

func TestBuildConfigVerifyUsesHostName(t *testing.T) {
	for _, mode := range []string{"verify-ca", "verify-full"} {
		cfg, err := buildConfig(testProfile(mode))
		if err != nil {
			t.Fatal(err)
		}
		if cfg.TLS == nil || cfg.TLS.InsecureSkipVerify || cfg.TLS.ServerName != "db.example" {
			t.Errorf("%s must verify against the host, got %+v", mode, cfg.TLS)
		}
	}
}

func TestBuildConfigLegacyOptions(t *testing.T) {
	p := testProfile("require")
	p.TLSMinVersion = "1.0"
	p.TLSLegacyCiphers = true
	cfg, err := buildConfig(p)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.TLS.MinVersion != tls.VersionTLS10 || len(cfg.TLS.CipherSuites) == 0 {
		t.Errorf("legacy options not applied: %+v", cfg.TLS)
	}
}

func TestBuildConfigRejectsUnknownSSLMode(t *testing.T) {
	if _, err := buildConfig(testProfile("sometimes")); err == nil {
		t.Fatal("expected error for unknown SSL mode")
	}
}
