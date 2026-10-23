// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"

	"zentro/internal/core"
)

// BuildQualifiedTableSelect returns "SELECT * FROM <schema>.<table>" quoted
// per connectionID's driver dialect (driver.QueryDialect.QuoteIdentifier) —
// e.g. double quotes for Postgres/MSSQL/SQLite, backticks for MySQL. Table
// and Catalog tabs must call this instead of hardcoding ANSI double-quote
// syntax client-side, since a tab's Pinned Environment (ADR-0001) can target
// a different DB engine than whatever's currently the Active Environment.
func (a *App) BuildQualifiedTableSelect(connectionID, schema, table string) (string, error) {
	profile, err := a.resolveConnectionProfileByID(connectionID)
	if err != nil {
		return "", err
	}
	drv, ok := core.Get(profile.Driver)
	if !ok {
		return "", fmt.Errorf("unsupported driver %q", profile.Driver)
	}
	return "SELECT * FROM " + drv.QuoteIdentifier(schema) + "." + drv.QuoteIdentifier(table), nil
}
