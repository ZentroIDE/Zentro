// SPDX-License-Identifier: GPL-3.0-only

package app

import "testing"

func useTempQueryPreflightConfigDir(t *testing.T) {
	t.Helper()
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	t.Setenv("APPDATA", t.TempDir())
	t.Setenv("HOME", t.TempDir())
}
