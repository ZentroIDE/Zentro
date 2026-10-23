// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"testing"

	"zentro/internal/core"
	msdriver "zentro/internal/driver/mssql"
	mydriver "zentro/internal/driver/mysql"
	pgdriver "zentro/internal/driver/postgres"
	sqdriver "zentro/internal/driver/sqlite"
)

// TestMain registers the four real drivers before any test runs, mirroring
// main.go's wiring. Several pure DDL-generation functions (schema-diff
// migration, write-preview) resolve dialect quoting through the driver
// registry rather than a hardcoded switch — without this, they'd silently
// quote nothing against an empty registry.
func TestMain(m *testing.M) {
	core.Register(pgdriver.New())
	core.Register(msdriver.New())
	core.Register(mydriver.New())
	core.Register(sqdriver.New())
	m.Run()
}
