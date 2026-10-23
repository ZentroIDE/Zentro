// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"strings"

	"zentro/internal/constant"
	"zentro/internal/utils"
)

// QueryFormatterService formats SQL. Options come from the user's saved
// preferences, read per call so a settings change applies immediately.
type QueryFormatterService struct {
	prefs func() utils.SQLFormatPrefs
}

func NewQueryFormatterService(prefs func() utils.SQLFormatPrefs) *QueryFormatterService {
	return &QueryFormatterService{prefs: prefs}
}

func (s *QueryFormatterService) FormatSQL(query string, dialect string) (string, error) {
	var opts utils.SQLFormatPrefs
	if s.prefs != nil {
		opts = s.prefs()
	}
	return formatSQLWithOptions(query, dialect, opts)
}

func formatSQLWithOptions(query, dialect string, prefs utils.SQLFormatPrefs) (string, error) {
	if strings.TrimSpace(query) == "" {
		return "", fmt.Errorf("format: query is empty")
	}

	switch strings.ToLower(strings.TrimSpace(dialect)) {
	case "", constant.DriverPostgres, constant.DriverMySQL, constant.DriverSQLServer, constant.DriverSQLite:
	default:
		return "", fmt.Errorf("format: unsupported dialect %q", dialect)
	}

	tokens := lexSQL(query, dialect)
	if len(tokens) == 0 {
		return "", fmt.Errorf("format: query is empty")
	}
	return formatSQLTokens(tokens, normalizeSQLFormatOptions(prefs)), nil
}
