// SPDX-License-Identifier: GPL-3.0-only

package app

// ListJobs returns every tracked Activity-panel job (running and finished),
// oldest first.
func (a *App) ListJobs() []*Job { return a.svc.Jobs.List() }

// CancelJob requests a soft stop on a running job — see JobService.Cancel.
func (a *App) CancelJob(id string) error { return a.svc.Jobs.Cancel(id) }

// KillJob force-stops a job that supports it (Capabilities.Kill) — see
// JobService.Kill. For a query job this terminates the whole backend
// session on the server, not just the currently running statement.
func (a *App) KillJob(id string) error { return a.svc.Jobs.Kill(id) }

// ClearFinishedJobs removes every terminal job from the Activity panel's
// list and returns the removed ids.
func (a *App) ClearFinishedJobs() []string { return a.svc.Jobs.ClearFinished() }
