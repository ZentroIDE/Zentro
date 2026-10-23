// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"strings"
)

// ApplyWailsProductVersion sets Version from the embedded wails.json's
// info.productVersion when no build-time -ldflags value was injected, so dev
// and ad-hoc `wails build` runs still report the real product version.
// An ldflags-provided Version always wins (CI carries prerelease suffixes that
// wails.json's numeric-only productVersion cannot).
func ApplyWailsProductVersion(wailsJSON []byte) {
	if strings.TrimSpace(Version) != "" {
		return
	}
	Version = versionFromWailsJSON(wailsJSON)
}

// versionFromWailsJSON returns a "vMAJOR.MINOR.PATCH" tag from productVersion,
// or "v0.0.0" if it is missing or unparsable. wails.json may carry a 4-part
// Windows-style version (release.yml pads it), which is not valid semver, so
// only the first three parts are kept.
func versionFromWailsJSON(raw []byte) string {
	var cfg struct {
		Info struct {
			ProductVersion string `json:"productVersion"`
		} `json:"info"`
	}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return "v0.0.0"
	}
	v := strings.TrimPrefix(strings.TrimSpace(cfg.Info.ProductVersion), "v")
	if v == "" {
		return "v0.0.0"
	}
	parts := strings.Split(v, ".")
	if len(parts) > 3 {
		parts = parts[:3]
	}
	return "v" + strings.Join(parts, ".")
}
