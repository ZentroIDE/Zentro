// SPDX-License-Identifier: GPL-3.0-only

//go:build darwin

package main

// framelessDefault is false on macOS: Frameless strips
// NSWindowStyleMaskTitled/Closable, which removes the native traffic lights
// outright. Mac.TitleBar (hidden-inset) is the macOS-native equivalent and
// needs Frameless off to render them.
const framelessDefault = false
