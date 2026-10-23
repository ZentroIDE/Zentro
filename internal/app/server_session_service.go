// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"strings"

	"zentro/internal/core"
	driverport "zentro/internal/driver"
)

// ServerSessionView is one row of the database server's own session list
// (see driverport.SessionMonitor), annotated with whether it's a connection
// Zentro itself currently holds — a query tab's pinned connection or a
// running export/import job.
type ServerSessionView struct {
	driverport.ServerSession
	IsSelf bool `json:"isSelf"`
}

// sessionMonitor resolves the active driver's optional SessionMonitor port
// (server session listing — see driver.go), or nil for a driver that
// doesn't implement it (SQLite has no server-wide session list).
func (s *QueryService) sessionMonitor() driverport.SessionMonitor {
	drv, ok := core.Get(strings.ToLower(strings.TrimSpace(s.getDriver())))
	if !ok {
		return nil
	}
	monitor, ok := drv.(driverport.SessionMonitor)
	if !ok {
		return nil
	}
	return monitor
}

// activeBackendIDs collects the server-side session identifiers of every
// connection Zentro currently holds — pinned query-tab sessions and
// running jobs (export/import) alike — so ListServerSessions can mark
// ServerSessionView.IsSelf.
func (s *QueryService) activeBackendIDs() map[string]bool {
	ids := make(map[string]bool)

	s.sessionsMu.Lock()
	for _, session := range s.sessions {
		if session.BackendID != "" {
			ids[session.BackendID] = true
		}
	}
	s.sessionsMu.Unlock()

	if s.jobs != nil {
		for _, job := range s.jobs.List() {
			if job.BackendID != "" {
				ids[job.BackendID] = true
			}
		}
	}
	return ids
}

// ListServerSessions lists every session currently open on the connected
// database server (not just Zentro's own jobs — see JobService for those).
// Returns an error for a driver with no SessionMonitor port (SQLite).
func (s *QueryService) ListServerSessions() ([]ServerSessionView, error) {
	monitor := s.sessionMonitor()
	if monitor == nil {
		return nil, fmt.Errorf("server session listing is not supported for this driver")
	}
	db := s.getDB()
	if db == nil {
		return nil, fmt.Errorf("no active connection")
	}
	sessions, err := monitor.ListSessions(s.ctx, db)
	if err != nil {
		return nil, err
	}

	selfIDs := s.activeBackendIDs()
	out := make([]ServerSessionView, len(sessions))
	for i, session := range sessions {
		out[i] = ServerSessionView{ServerSession: session, IsSelf: selfIDs[session.ID]}
	}
	return out, nil
}

// mapSessionCancelError rewrites a driver's native permission-denied error
// (phrased differently by every server) into a message the FE can show
// as-is, without needing to pattern-match driver-specific text itself.
func mapSessionCancelError(err error) error {
	if err == nil {
		return nil
	}
	lower := strings.ToLower(err.Error())
	for _, needle := range []string{"permission", "privilege", "access denied", "superuser", "sysadmin"} {
		if strings.Contains(lower, needle) {
			return fmt.Errorf("permission denied: %w", err)
		}
	}
	return err
}

// CancelServerSession asks the server to stop a session's current
// statement, leaving the session itself open (soft-cancel — see
// driverport.BackendCanceller). Returns an error for a driver with no
// BackendCanceller port (SQLite).
func (s *QueryService) CancelServerSession(sessionID string) error {
	canceller := s.backendCanceller()
	if canceller == nil {
		return fmt.Errorf("cancelling a session is not supported for this driver")
	}
	if err := canceller.CancelBackend(s.ctx, s.getDB(), sessionID, false); err != nil {
		return mapSessionCancelError(err)
	}
	return nil
}

// KillServerSession asks the server to end a session entirely, rolling
// back any open transaction (force-kill — see driverport.BackendCanceller).
// Returns an error for a driver with no BackendCanceller port (SQLite).
func (s *QueryService) KillServerSession(sessionID string) error {
	canceller := s.backendCanceller()
	if canceller == nil {
		return fmt.Errorf("killing a session is not supported for this driver")
	}
	if err := canceller.CancelBackend(s.ctx, s.getDB(), sessionID, true); err != nil {
		return mapSessionCancelError(err)
	}
	return nil
}
