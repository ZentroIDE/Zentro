// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"strings"
	"unicode/utf8"

	"zentro/internal/extensions/ai"
)

const aiCellMaxBytes = 1024

// serializeCell turns one scanned value into the string a tool may send.
// Credential columns are always "***". There is no switch that turns this off.
// A cell whose text looks like an email, phone, card, token, or credential is
// "***" too, whatever its column is called, so an alias or an expression
// cannot carry one out (ADR 0017). Only that cell is hidden; the rest of the
// result still goes.
func serializeCell(value any, sensitive bool) string {
	if sensitive {
		return "***"
	}
	if value == nil {
		return ""
	}
	var text string
	switch v := value.(type) {
	case []byte:
		if !looksLikeText(v) {
			return fmt.Sprintf("<bytea %s>", formatByteSize(len(v)))
		}
		text = clipCell(string(v))
	case string:
		text = clipCell(v)
	default:
		// Numbers, booleans, and times are never a shape worth hiding, and a
		// plain number reads as a phone to the scan.
		return clipCell(fmt.Sprint(v))
	}
	if len(ai.ScanText(text)) > 0 {
		return "***"
	}
	return text
}

func clipCell(s string) string {
	if len(s) <= aiCellMaxBytes {
		return s
	}
	cut := s[:aiCellMaxBytes]
	for len(cut) > 0 && !utf8.ValidString(cut) {
		cut = cut[:len(cut)-1]
	}
	return cut
}

func formatByteSize(n int) string {
	if n < 1024 {
		return fmt.Sprintf("%d B", n)
	}
	return fmt.Sprintf("%.1f KB", float64(n)/1024.0)
}

func looksLikeText(b []byte) bool {
	if !utf8.Valid(b) {
		return false
	}
	for _, r := range string(b) {
		if r < 32 && r != '\n' && r != '\r' && r != '\t' {
			return false
		}
	}
	return true
}

// maskedColumnsForTable names the credential columns of one table, which
// are always "***".
func maskedColumnsForTable(table string, columns []ai.Column) map[string]bool {
	out := map[string]bool{}
	for _, column := range columns {
		if isCredentialColumn(table, column.Name, column.Comment) {
			out[strings.ToLower(column.Name)] = true
		}
	}
	return out
}

func columnIsMasked(name string, masked map[string]bool) bool {
	return masked[strings.ToLower(name)]
}
