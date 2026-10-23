// SPDX-License-Identifier: GPL-3.0-only

package utils

// Channel is set at build time via -ldflags "-X 'zentro/internal/utils.Channel=nightly'".
// It lives here rather than in internal/app so both internal/app (About info,
// update checks) and internal/utils (config/cache path separation) can read
// it without an import cycle - internal/app already imports internal/utils,
// never the reverse.
var Channel = "stable"
