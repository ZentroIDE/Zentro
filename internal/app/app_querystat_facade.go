// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"zentro/internal/extensions/querystat"
)

// queryStatsReport reads the collected statistics without the plan check. The
// AI assistant's get_query_stats tool uses it: the assistant is free on every
// plan, only the panel that charts the same data is Pro.
func (a *App) queryStatsReport(filter querystat.StatFilter) querystat.StatReport {
	ext, ok := a.svc.GetExtension("querystat")
	if !ok {
		return querystat.StatReport{}
	}
	return ext.(*querystat.Service).GetReport(filter)
}
