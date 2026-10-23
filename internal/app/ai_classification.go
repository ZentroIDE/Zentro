// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"strings"
	"unicode"
)

// credentialNames are column names that hold a secret. A matching column is
// always returned as "***" by every tool that reads rows. There is no user
// setting and no way to turn it off (ADR 0017): it guards against an
// accident, it is not a privacy promise. Names match as whole identifiers or
// underscore-bounded fragments (password, user_password, password_hash),
// never as a raw substring.
var credentialNames = []string{
	"password", "passwd", "pwd", "secret", "token", "api_key", "apikey",
	"access_key", "private_key", "secret_key", "auth_token", "refresh_token",
}

// isCredentialColumn reports whether a column reads as a secret by its name,
// by its table and name together (users.pwd is caught as users_pwd), or by
// its comment.
func isCredentialColumn(table, column, comment string) bool {
	return nameIsCredential(column) ||
		nameIsCredential(table+"_"+column) ||
		nameIsCredential(comment)
}

func nameIsCredential(raw string) bool {
	norm := normalizeIdent(raw)
	if norm == "" {
		return false
	}
	for _, name := range credentialNames {
		if identHasName(norm, name) {
			return true
		}
	}
	return false
}

func identHasName(norm, name string) bool {
	if norm == name {
		return true
	}
	return strings.HasPrefix(norm, name+"_") ||
		strings.HasSuffix(norm, "_"+name) ||
		strings.Contains(norm, "_"+name+"_")
}

func normalizeIdent(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	if s == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(s))
	prevUnderscore := false
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z' || r >= '0' && r <= '9':
			b.WriteRune(r)
			prevUnderscore = false
		case unicode.IsSpace(r) || r == '-' || r == '.' || r == '/':
			if !prevUnderscore && b.Len() > 0 {
				b.WriteByte('_')
				prevUnderscore = true
			}
		default:
			if !prevUnderscore && b.Len() > 0 {
				b.WriteByte('_')
				prevUnderscore = true
			}
		}
	}
	return strings.Trim(b.String(), "_")
}
