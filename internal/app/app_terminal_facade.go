// SPDX-License-Identifier: GPL-3.0-only

package app

// TerminalOpen starts a shell for the Terminal tab and returns its session.
// kind is "local" or "ssh"; for "ssh", profileID is the connection whose SSH
// server to log in to. Output arrives as terminal:data events.
func (a *App) TerminalOpen(kind, profileID string, cols, rows int) (*TerminalInfo, error) {
	return a.svc.Terminal.Open(kind, profileID, cols, rows)
}

// TerminalWrite sends keystrokes to an open terminal session.
func (a *App) TerminalWrite(id, data string) error { return a.svc.Terminal.Write(id, data) }

// TerminalResize tells an open session its viewport changed size.
func (a *App) TerminalResize(id string, cols, rows int) error {
	return a.svc.Terminal.Resize(id, cols, rows)
}

// TerminalClose ends a terminal session.
func (a *App) TerminalClose(id string) { a.svc.Terminal.Close(id) }
