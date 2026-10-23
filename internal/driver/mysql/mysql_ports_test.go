// SPDX-License-Identifier: GPL-3.0-only

package mysql

import "zentro/internal/driver"

var (
	_ driver.SQLValidator       = (*MySQLDriver)(nil)
	_ driver.PlanExplainer      = (*MySQLDriver)(nil)
	_ driver.TableStatsReader   = (*MySQLDriver)(nil)
	_ driver.IndexReader        = (*MySQLDriver)(nil)
	_ driver.DependencyReader   = (*MySQLDriver)(nil)
	_ driver.TableDetailsReader = (*MySQLDriver)(nil)
	_ driver.ReadOnlyRunner     = (*MySQLDriver)(nil)
	_ driver.DryRunner          = (*MySQLDriver)(nil)
)
