// SPDX-License-Identifier: GPL-3.0-only

package app

import "zentro/internal/utils"

// Settings facade — preference reads/writes.

func (a *App) GetPreferences() utils.Preferences { return a.prefs }

func (a *App) SetPreferences(p utils.Preferences) error {
	a.prefs = p
	return utils.SavePreferences(p)
}
