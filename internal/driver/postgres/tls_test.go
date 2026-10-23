// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"crypto/tls"
	"testing"

	"zentro/internal/models"
)

func testProfile(sslMode string) *models.ConnectionProfile {
	return &models.ConnectionProfile{
		Host: "db.example", Port: 5432, Username: "u", Password: "p", DBName: "d",
		SSLMode: sslMode, ConnectTimeout: 5,
	}
}

func TestBuildConfigDisableHasNoTLS(t *testing.T) {
	p := testProfile("disable")
	p.TLSLegacyCiphers = true
	cfg, err := buildConfig(p)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.TLSConfig != nil {
		t.Fatal("legacy options must not turn TLS on when sslmode=disable")
	}
}

func TestBuildConfigRequireAppliesLegacyOptions(t *testing.T) {
	p := testProfile("require")
	p.TLSMinVersion = "1.0"
	p.TLSLegacyCiphers = true
	cfg, err := buildConfig(p)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.TLSConfig == nil || cfg.TLSConfig.MinVersion != tls.VersionTLS10 {
		t.Fatalf("TLS config = %+v, want MinVersion TLS 1.0", cfg.TLSConfig)
	}
	if len(cfg.TLSConfig.CipherSuites) == 0 {
		t.Error("expected legacy cipher suites")
	}
}

func TestBuildConfigPreferAppliesToFallbacks(t *testing.T) {
	p := testProfile("prefer")
	p.TLSMinVersion = "1.0"
	cfg, err := buildConfig(p)
	if err != nil {
		t.Fatal(err)
	}
	for i, fb := range cfg.Fallbacks {
		if fb.TLSConfig != nil && fb.TLSConfig.MinVersion != tls.VersionTLS10 {
			t.Errorf("fallback %d MinVersion = %x, want TLS 1.0", i, fb.TLSConfig.MinVersion)
		}
	}
	if cfg.TLSConfig == nil || cfg.TLSConfig.MinVersion != tls.VersionTLS10 {
		t.Errorf("primary TLS config = %+v", cfg.TLSConfig)
	}
}
