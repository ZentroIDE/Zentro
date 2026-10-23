// SPDX-License-Identifier: GPL-3.0-only

//go:build !darwin

package main

// framelessDefault is true on Windows/Linux, where WindowControls.tsx draws
// the custom minimize/maximize/close buttons.
const framelessDefault = true
