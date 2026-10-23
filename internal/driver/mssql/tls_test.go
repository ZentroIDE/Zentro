// SPDX-License-Identifier: GPL-3.0-only

package mssql

import (
	"crypto/tls"
	"testing"

	"zentro/internal/models"
)

func testProfile() *models.ConnectionProfile {
	return &models.ConnectionProfile{
		Host: "db.example", Port: 1433, Username: "sa", Password: "p@ss", ConnectTimeout: 5,
	}
}

func TestBuildConfigKeepsTLS10FloorByDefault(t *testing.T) {
	cfg, err := buildConfig(testProfile())
	if err != nil {
		t.Fatal(err)
	}
	if cfg.TLSConfig == nil || cfg.TLSConfig.MinVersion != tls.VersionTLS10 {
		t.Fatalf("default min version must stay TLS 1.0, got %+v", cfg.TLSConfig)
	}
	if cfg.TLSConfig.CipherSuites != nil {
		t.Error("default profile must not widen cipher suites")
	}
}

func TestBuildConfigAppliesLegacyOptions(t *testing.T) {
	p := testProfile()
	p.TLSMinVersion = "1.1"
	p.TLSLegacyCiphers = true
	cfg, err := buildConfig(p)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.TLSConfig.MinVersion != tls.VersionTLS11 {
		t.Errorf("MinVersion = %x, want TLS 1.1", cfg.TLSConfig.MinVersion)
	}
	found := false
	for _, id := range cfg.TLSConfig.CipherSuites {
		if id == tls.TLS_RSA_WITH_AES_128_CBC_SHA {
			found = true
		}
	}
	if !found {
		t.Error("legacy ciphers must include TLS_RSA_WITH_AES_128_CBC_SHA")
	}
}

func TestBuildConfigRejectsBadVersion(t *testing.T) {
	p := testProfile()
	p.TLSMinVersion = "bogus"
	if _, err := buildConfig(p); err == nil {
		t.Fatal("expected error for bogus TLS version")
	}
}
