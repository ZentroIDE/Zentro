// SPDX-License-Identifier: GPL-3.0-only

package mssql

import "zentro/internal/driver"

var (
	_ driver.SQLValidator       = (*MSSQLDriver)(nil)
	_ driver.PlanExplainer      = (*MSSQLDriver)(nil)
	_ driver.TableStatsReader   = (*MSSQLDriver)(nil)
	_ driver.IndexReader        = (*MSSQLDriver)(nil)
	_ driver.DependencyReader   = (*MSSQLDriver)(nil)
	_ driver.TableDetailsReader = (*MSSQLDriver)(nil)
	_ driver.ReadOnlyRunner     = (*MSSQLDriver)(nil)
	_ driver.DryRunner          = (*MSSQLDriver)(nil)
)
