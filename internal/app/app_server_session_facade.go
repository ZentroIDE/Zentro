// SPDX-License-Identifier: GPL-3.0-only

package app

// Server sessions facade (server_session_service.go).

// ListServerSessions lists every session currently open on the connected
// database server, not just Zentro's own jobs. Errors for a driver with no
// SessionMonitor port (SQLite).
func (a *App) ListServerSessions() ([]ServerSessionView, error) {
	return a.svc.Query.ListServerSessions()
}

// CancelServerSession soft-cancels a session's current statement on the
// server, leaving the session open.
func (a *App) CancelServerSession(sessionID string) error {
	return a.svc.Query.CancelServerSession(sessionID)
}

// KillServerSession force-ends a session on the server, rolling back any
// open transaction.
func (a *App) KillServerSession(sessionID string) error {
	return a.svc.Query.KillServerSession(sessionID)
}
