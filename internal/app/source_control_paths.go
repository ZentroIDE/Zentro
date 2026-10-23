// SPDX-License-Identifier: GPL-3.0-only

package app

import "strings"

func sanitizePathSegment(input string) string {
	trimmed := strings.TrimSpace(strings.ToLower(input))
	if trimmed == "" {
		return "unknown"
	}
	var out strings.Builder
	lastDash := false
	for _, r := range trimmed {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' {
			out.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			out.WriteByte('-')
			lastDash = true
		}
	}
	result := strings.Trim(out.String(), "-")
	if result == "" {
		return "unknown"
	}
	return result
}
