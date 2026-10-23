// SPDX-License-Identifier: GPL-3.0-only

package app

import "time"

// StartStatsSampler starts (or restarts) the live status-bar sampler; samples
// arrive as stats:sample events. intervalMs is clamped to 1000-60000.
func (a *App) StartStatsSampler(intervalMs int) {
	a.svc.Stats.Start(time.Duration(intervalMs) * time.Millisecond)
}

// StopStatsSampler stops the sampler so no work is done while stats are hidden.
func (a *App) StopStatsSampler() { a.svc.Stats.Stop() }
