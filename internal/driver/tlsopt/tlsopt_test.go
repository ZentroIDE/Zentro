// SPDX-License-Identifier: GPL-3.0-only

package tlsopt

import (
	"crypto/tls"
	"errors"
	"strings"
	"testing"

	"zentro/internal/models"
)

func TestMinVersion(t *testing.T) {
	cases := map[string]uint16{
		"":    0,
		"1.0": tls.VersionTLS10,
		"1.1": tls.VersionTLS11,
		"1.2": tls.VersionTLS12,
		"1.3": tls.VersionTLS13,
	}
	for in, want := range cases {
		got, err := MinVersion(in)
		if err != nil || got != want {
			t.Errorf("MinVersion(%q) = %v, %v; want %v, nil", in, got, err, want)
		}
	}
	if _, err := MinVersion("0.9"); err == nil {
		t.Error("MinVersion(\"0.9\") should fail")
	}
}

func TestApplyLeavesNilConfigAlone(t *testing.T) {
	p := &models.ConnectionProfile{TLSMinVersion: "1.0", TLSLegacyCiphers: true}
	if err := Apply(nil, p); err != nil {
		t.Fatalf("Apply(nil) = %v", err)
	}
}

func TestApplySetsMinVersionAndLegacyCiphers(t *testing.T) {
	cfg := &tls.Config{MinVersion: tls.VersionTLS12}
	p := &models.ConnectionProfile{TLSMinVersion: "1.0", TLSLegacyCiphers: true}
	if err := Apply(cfg, p); err != nil {
		t.Fatal(err)
	}
	if cfg.MinVersion != tls.VersionTLS10 {
		t.Errorf("MinVersion = %x, want TLS 1.0", cfg.MinVersion)
	}
	if !hasCipher(cfg.CipherSuites, tls.TLS_RSA_WITH_AES_128_CBC_SHA) {
		t.Error("legacy suites must include TLS_RSA_WITH_AES_128_CBC_SHA")
	}
	if !hasCipher(cfg.CipherSuites, tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256) {
		t.Error("legacy suites must still include the modern ECDHE suites")
	}
}

func TestApplyDefaultsKeepDriverSettings(t *testing.T) {
	cfg := &tls.Config{MinVersion: tls.VersionTLS12}
	if err := Apply(cfg, &models.ConnectionProfile{}); err != nil {
		t.Fatal(err)
	}
	if cfg.MinVersion != tls.VersionTLS12 || cfg.CipherSuites != nil {
		t.Errorf("empty options must not change config: min=%x ciphers=%v", cfg.MinVersion, cfg.CipherSuites)
	}
}

func TestApplyRejectsBadVersion(t *testing.T) {
	err := Apply(&tls.Config{}, &models.ConnectionProfile{TLSMinVersion: "nope"})
	if err == nil {
		t.Fatal("expected error for invalid TLS version")
	}
}

func TestExplain(t *testing.T) {
	cases := []struct {
		raw  string
		want string // substring of the explanation, "" = not a TLS error
	}{
		{"TLS Handshake failed: tls: protocol version not supported", "TLS handshake failed"},
		{"failed to connect to host: tls error (server refused TLS connection)", "TLS handshake failed"},
		{"x509: certificate signed by unknown authority", "not trusted"},
		{"login failed for user 'sa'", ""},
		{"connection refused", ""},
	}
	for _, c := range cases {
		got := Explain(errors.New(c.raw))
		switch {
		case c.want == "" && got != nil:
			t.Errorf("Explain(%q) = %v, want nil", c.raw, got)
		case c.want != "" && (got == nil || !strings.Contains(got.Error(), c.want)):
			t.Errorf("Explain(%q) = %v, want substring %q", c.raw, got, c.want)
		case got != nil && !strings.Contains(got.Error(), c.raw):
			t.Errorf("Explain(%q) dropped the raw error", c.raw)
		}
	}
	if Explain(nil) != nil {
		t.Error("Explain(nil) must be nil")
	}
}

func hasCipher(ids []uint16, id uint16) bool {
	for _, v := range ids {
		if v == id {
			return true
		}
	}
	return false
}
