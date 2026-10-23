// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// spawnInstanceForProject launches a new OS process of the current
// executable pointed at projectID via the --project=<id> flag (parsed in
// main.go, consumed once via App.GetLaunchProjectID). The new window's own
// per-project instance lock (see project_lock_service.go) decides whether
// the open actually succeeds — this function only starts the process.
func spawnInstanceForProject(projectID string) error {
	if projectID == "" {
		return fmt.Errorf("project id is required")
	}
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("resolve executable: %w", err)
	}
	cmd := exec.Command(exePath, "--project="+projectID)
	cmd.Dir = filepath.Dir(exePath)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("launch new window: %w", err)
	}
	return nil
}
