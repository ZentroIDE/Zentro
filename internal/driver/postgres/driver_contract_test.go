// SPDX-License-Identifier: GPL-3.0-only

package postgres

import (
	"testing"

	"zentro/internal/driver"
)

// Postgres is the only driver implementing the MCP "read and check"
// ports (T2.1, plus TableDetailsReader from T2.7); this test is the single place that fails loudly
// if one of them is accidentally dropped or its signature drifts.
func TestPostgresDriverImplementsAllMCPReadPorts(t *testing.T) {
	d := New()
	var (
		_ driver.SQLValidator       = d
		_ driver.PlanExplainer      = d
		_ driver.DependencyReader   = d
		_ driver.TableStatsReader   = d
		_ driver.IndexReader        = d
		_ driver.TableDetailsReader = d
	)
}
