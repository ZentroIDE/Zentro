// SPDX-License-Identifier: GPL-3.0-only

package app

// Formatter facade — thin delegate to the SQL formatter (query_formatter.go).

func (a *App) FormatSQL(query string, dialect string) (string, error) {
	return a.svc.Formatter.FormatSQL(query, dialect)
}
