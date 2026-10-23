// SPDX-License-Identifier: GPL-3.0-only

// Package tlsopt applies the per-connection TLS options of a profile to a
// *tls.Config and explains TLS failures. It is shared by the network drivers
// (postgres, mysql, mssql) so legacy-server handling lives in one place.
package tlsopt

import (
	"crypto/tls"
	"fmt"
	"strings"

	"zentro/internal/models"
)

// MinVersion maps the profile's TLSMinVersion ("", "1.0".."1.3") to a
// crypto/tls constant. "" returns 0, meaning "keep the driver's default".
func MinVersion(s string) (uint16, error) {
	switch strings.TrimSpace(s) {
	case "":
		return 0, nil
	case "1.0":
		return tls.VersionTLS10, nil
	case "1.1":
		return tls.VersionTLS11, nil
	case "1.2":
		return tls.VersionTLS12, nil
	case "1.3":
		return tls.VersionTLS13, nil
	default:
		return 0, fmt.Errorf("unsupported TLS minimum version %q (use 1.0, 1.1, 1.2 or 1.3)", s)
	}
}

// LegacyCipherSuites returns every cipher suite Go implements, including the
// ones it no longer offers by default (RSA key exchange, 3DES, CBC-SHA1) that
// old SQL Server / MySQL / Postgres builds still require. It only affects
// TLS 1.2 and below; TLS 1.3 suites are not configurable.
func LegacyCipherSuites() []uint16 {
	secure := tls.CipherSuites()
	insecure := tls.InsecureCipherSuites()
	ids := make([]uint16, 0, len(secure)+len(insecure))
	for _, s := range secure {
		ids = append(ids, s.ID)
	}
	for _, s := range insecure {
		ids = append(ids, s.ID)
	}
	return ids
}

// Apply copies the profile's TLS options onto cfg. A nil cfg (TLS disabled by
// the driver/SSL mode) is left alone, so enabling legacy options never turns
// encryption on by itself.
func Apply(cfg *tls.Config, p *models.ConnectionProfile) error {
	if cfg == nil {
		return nil
	}
	min, err := MinVersion(p.TLSMinVersion)
	if err != nil {
		return err
	}
	if min != 0 {
		cfg.MinVersion = min
	}
	if p.TLSLegacyCiphers {
		cfg.CipherSuites = LegacyCipherSuites()
	}
	return nil
}

// Explain turns a raw TLS/handshake/certificate failure into a message that
// says what to change. It returns nil when err is not TLS related, so a driver
// can fall through to its own mapping. The raw error is kept for bug reports.
func Explain(err error) error {
	if err == nil {
		return nil
	}
	msg := strings.ToLower(err.Error())
	switch {
	case containsAny(msg, "x509:", "certificate is not trusted", "unknown authority", "certificate signed by"):
		return fmt.Errorf("the server certificate is not trusted - enable \"Trust server certificate\" or use SSL mode \"require\" (%s)", err.Error())
	case containsAny(msg, "tls:", "tls error", "handshake", "server refused tls", "ssl is not enabled"):
		return fmt.Errorf("TLS handshake failed - the server may only support an older TLS version or older ciphers; set a lower TLS minimum version and enable legacy ciphers in the connection's Advanced settings (%s)", err.Error())
	default:
		return nil
	}
}

func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if strings.Contains(s, sub) {
			return true
		}
	}
	return false
}
