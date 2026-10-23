// SPDX-License-Identifier: GPL-3.0-only

//go:build !windows && !linux && !darwin

package app

// Nothing outside Windows, Linux (as an AppImage), and macOS has a signed,
// silently-reinstallable artifact today (see update_installer_windows.go,
// update_installer_linux.go, and update_installer_darwin.go for those three),
// so this catch-all stays on the existing check-and-open-a-link flow.

func (s *UpdateService) SpawnUpdateHelper(info UpdateInfo, productName string) error {
	return ErrAutoUpdateUnsupported
}

func (s *UpdateService) UpdateCacheDir() (string, error) {
	return "", ErrAutoUpdateUnsupported
}

func (s *UpdateService) ConsumeLastUpdateResult() (*UpdateResult, bool) {
	return nil, false
}
