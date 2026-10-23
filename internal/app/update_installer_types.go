// SPDX-License-Identifier: GPL-3.0-only

package app

import "errors"

// ErrAutoUpdateUnsupported is returned by the update-installer methods below
// on any install that has no signed, silently-reinstallable artifact for its
// current platform/packaging (macOS; Linux outside an AppImage). Those stay
// on the existing check-and-open-a-link flow.
var ErrAutoUpdateUnsupported = errors.New("auto-update is not supported for this install")

// UpdateResult is what a platform's detached update helper leaves behind
// once it's done, for ConsumeLastUpdateResult to report back on the app's
// next launch. Shared across update_installer_windows.go and
// update_installer_linux.go so their on-disk JSON shape stays identical.
type UpdateResult struct {
	OK      bool   `json:"ok"`
	Version string `json:"version"`
	Error   string `json:"error"`
}
