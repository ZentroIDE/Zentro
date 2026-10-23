#!/usr/bin/env bash
# Packages the Linux Wails binary as a distro-agnostic AppImage with embedded
# update information + a .zsync sidecar, so appimageupdatetool (bundled into
# the AppDir here, invoked at runtime by internal/app/update_installer_linux.go)
# can update it in place.
#
# Uses linuxdeploy + linuxdeploy-plugin-gtk to bundle GTK3/WebKit2GTK and
# their runtime dependencies into the AppDir - not just the bare binary -
# specifically so the same AppImage also runs on distros that don't ship the
# webkit2gtk-4.0 this binary was linked against (Fedora ships webkit2gtk4.1
# instead, which is why the separate rpm build lane in release.yml exists in
# the first place). webkit2gtk additionally spawns its renderer/network
# process helpers by absolute path rather than linking against them as
# shared libraries, so linuxdeploy's automatic ldd-based bundling never finds
# them - this script copies them in itself and points WEBKIT_EXEC_PATH at
# the bundled copy via a custom AppRun.
#
# Usage: build-appimage.sh <binary-path> <version> <output-appimage-path>
#
# Requires: curl, pkg-config + the webkit2gtk-4.0 dev package (for
# --variable=libexecdir), and an x86_64 Linux host (linuxdeploy/
# appimageupdatetool below are pinned x86_64 static builds). Intended to run
# inside .github/workflows/release.yml's ubuntu-22.04 job only, immediately
# after that job's own webkit2gtk-4.0 build.
set -euo pipefail

BINARY_PATH="$1"
VERSION="$2"
OUTPUT_PATH="$3"

# TODO(spike): pin exact versions + verify sha256 once this lane has run live
# on both a plain Ubuntu desktop and a Fedora desktop - same caveat as the
# Fedora/nfpm lane's existing TODO(spike) comments in release.yml. Bundling
# WebKitGTK into an AppImage is a known-fiddly corner of the AppImage
# ecosystem (helper-process paths, GStreamer codec plugins, etc.); treat the
# first few releases built this way as needing a real smoke test on both
# distros, not just "the workflow step exited 0".
LINUXDEPLOY_URL="https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage"
# linuxdeploy-plugin-gtk stopped publishing a "continuous" release (its
# releases page went to zero assets, breaking this lane on 2026-09-23) - the
# plugin is just a shell script, so fetch it straight from the repo instead,
# pinned to a commit for reproducibility rather than tracking master.
LINUXDEPLOY_GTK_PLUGIN_URL="https://raw.githubusercontent.com/linuxdeploy/linuxdeploy-plugin-gtk/3b67a1d1c1b0c8268f57f2bce40fe2d33d409cea/linuxdeploy-plugin-gtk.sh"
LINUXDEPLOY_APPIMAGE_PLUGIN_URL="https://github.com/linuxdeploy/linuxdeploy-plugin-appimage/releases/download/continuous/linuxdeploy-plugin-appimage-x86_64.AppImage"
APPIMAGEUPDATETOOL_URL="https://github.com/AppImageCommunity/AppImageUpdate/releases/download/continuous/appimageupdatetool-x86_64.AppImage"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# All three tools below are themselves shipped as AppImages, which normally
# need FUSE to mount - not available by default on GitHub-hosted runners.
# This env var (honored by every AppImage built with a recent runtime) makes
# them extract themselves and run from disk instead.
export APPIMAGE_EXTRACT_AND_RUN=1

echo "Downloading linuxdeploy + plugins..."
curl -fsSL -o "$WORK_DIR/linuxdeploy-x86_64.AppImage" "$LINUXDEPLOY_URL"
curl -fsSL -o "$WORK_DIR/linuxdeploy-plugin-gtk.sh" "$LINUXDEPLOY_GTK_PLUGIN_URL"
curl -fsSL -o "$WORK_DIR/linuxdeploy-plugin-appimage-x86_64.AppImage" "$LINUXDEPLOY_APPIMAGE_PLUGIN_URL"
curl -fsSL -o "$WORK_DIR/appimageupdatetool-x86_64.AppImage" "$APPIMAGEUPDATETOOL_URL"
chmod +x \
    "$WORK_DIR/linuxdeploy-x86_64.AppImage" \
    "$WORK_DIR/linuxdeploy-plugin-gtk.sh" \
    "$WORK_DIR/linuxdeploy-plugin-appimage-x86_64.AppImage" \
    "$WORK_DIR/appimageupdatetool-x86_64.AppImage"
# linuxdeploy finds its plugins ("--plugin gtk", "--output appimage") by
# looking for linuxdeploy-plugin-<name>(.sh)? on $PATH.
export PATH="$WORK_DIR:$PATH"

APPDIR="$WORK_DIR/Zentro.AppDir"
mkdir -p "$APPDIR/usr/bin"
cp "$BINARY_PATH" "$APPDIR/usr/bin/zentro"
chmod +x "$APPDIR/usr/bin/zentro"
cp "$WORK_DIR/appimageupdatetool-x86_64.AppImage" "$APPDIR/usr/bin/appimageupdatetool"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cp "$REPO_ROOT/build/linux/zentro.desktop" "$APPDIR/zentro.desktop"
cp "$REPO_ROOT/build/linux/zentro.png" "$APPDIR/zentro.png"

mkdir -p "$APPDIR/usr/share/doc/zentro"
cp "$REPO_ROOT/THIRD_PARTY_NOTICES.md" "$APPDIR/usr/share/doc/zentro/THIRD_PARTY_NOTICES.md"
cp "$REPO_ROOT/LICENSE" "$APPDIR/usr/share/doc/zentro/LICENSE"

# Locate the helper-process binaries on disk directly rather than trusting
# webkit2gtk-4.0.pc's declared variables, which have proven unreliable across
# distro package revisions: "libexecdir" stopped being exported as of 2.50.x
# (broke this lane on 2026-09-23), and as of the same day pkg-config can't
# resolve a usable path via either "libexecdir" or the "libdir" fallback on
# this runner either. A filesystem search for the network-process helper is
# authoritative regardless of how the installed package declares its own
# paths, so use that as the primary strategy and keep pkg-config only as a
# fallback in case the filesystem layout changes again.
WEBKIT_HELPER_PATH="$(find /usr/lib /usr/libexec -maxdepth 6 -name 'WebKitNetworkProcess' 2>/dev/null | head -1)"
if [ -n "$WEBKIT_HELPER_PATH" ]; then
    WEBKIT_LIBEXEC_DIR="$(dirname "$WEBKIT_HELPER_PATH")"
else
    WEBKIT_LIBEXEC_DIR="$(pkg-config --variable=libexecdir webkit2gtk-4.0 2>/dev/null || true)"
    if [ -z "$WEBKIT_LIBEXEC_DIR" ]; then
        WEBKIT_LIBDIR="$(pkg-config --variable=libdir webkit2gtk-4.0 2>/dev/null || true)"
        [ -n "$WEBKIT_LIBDIR" ] && WEBKIT_LIBEXEC_DIR="$WEBKIT_LIBDIR/webkit2gtk-4.0"
    fi
fi
if [ -z "${WEBKIT_LIBEXEC_DIR:-}" ] || [ ! -d "$WEBKIT_LIBEXEC_DIR" ]; then
    echo "Could not locate webkit2gtk-4.0 helper processes (tried filesystem search and pkg-config)" >&2
    echo "--- diagnostics ---" >&2
    pkg-config --exists webkit2gtk-4.0 && echo "pkg-config sees webkit2gtk-4.0" >&2 || echo "pkg-config does NOT see webkit2gtk-4.0" >&2
    echo "pkg-config --modversion: $(pkg-config --modversion webkit2gtk-4.0 2>&1 || echo n/a)" >&2
    echo "pkg-config --variable=libdir: $(pkg-config --variable=libdir webkit2gtk-4.0 2>&1 || echo n/a)" >&2
    echo "pkg-config --variable=libexecdir: $(pkg-config --variable=libexecdir webkit2gtk-4.0 2>&1 || echo n/a)" >&2
    dpkg -l 2>/dev/null | grep -i webkit2gtk >&2 || echo "no webkit2gtk packages found via dpkg" >&2
    exit 1
fi
# Mirror the absolute build-host path under the AppDir root (the standard
# AppImage bundling convention) so the WEBKIT_EXEC_PATH set in AppRun below
# lines up with where webkit2gtk itself expects to find these helpers.
mkdir -p "$APPDIR$WEBKIT_LIBEXEC_DIR"
cp -a "$WEBKIT_LIBEXEC_DIR/." "$APPDIR$WEBKIT_LIBEXEC_DIR/"

# A custom AppRun - linuxdeploy leaves an existing one alone instead of
# generating its own - so we can export WEBKIT_EXEC_PATH. The gtk plugin's
# own environment setup (LD_LIBRARY_PATH, GTK_PATH, GSETTINGS_SCHEMA_DIR,
# GDK_PIXBUF_MODULE_FILE, etc.) still applies: it's dropped into
# apprun-hooks/*.sh during the linuxdeploy run below, and this AppRun sources
# every hook there itself, exactly like linuxdeploy's own generated AppRun
# would.
cat > "$APPDIR/AppRun" <<EOF
#!/bin/sh
HERE="\$(dirname "\$(readlink -f "\${0}")")"
export WEBKIT_EXEC_PATH="\$HERE$WEBKIT_LIBEXEC_DIR"
for hook in "\$HERE"/apprun-hooks/*.sh; do
    [ -f "\$hook" ] && . "\$hook"
done
exec "\$HERE/usr/bin/zentro" "\$@"
EOF
chmod +x "$APPDIR/AppRun"

# Where the running AppImage looks for updates: the public repo releases are published to.
: "${PUBLIC_RELEASE_REPO:?set PUBLIC_RELEASE_REPO (owner/repo of the public repo releases are published to)}"
RELEASE_OWNER="${PUBLIC_RELEASE_REPO%%/*}"
RELEASE_REPO="${PUBLIC_RELEASE_REPO##*/}"

echo "Running linuxdeploy (bundles GTK3/WebKit2GTK shared libs)..."
# OUTPUT tells linuxdeploy-plugin-appimage to write (via mksquashfs) straight
# to OUTPUT_PATH, so its directory must exist before this runs - mksquashfs
# fails with "Could not create destination file" otherwise (broke this lane
# on 2026-09-23).
mkdir -p "$(dirname "$OUTPUT_PATH")"
UPDATE_INFORMATION="gh-releases-zsync|${RELEASE_OWNER}|${RELEASE_REPO}|latest|zentro-*-linux-amd64.AppImage.zsync" \
OUTPUT="$OUTPUT_PATH" \
"$WORK_DIR/linuxdeploy-x86_64.AppImage" \
    --appdir "$APPDIR" \
    --executable "$APPDIR/usr/bin/zentro" \
    --desktop-file "$APPDIR/zentro.desktop" \
    --icon-file "$APPDIR/zentro.png" \
    --plugin gtk \
    --output appimage

if [ ! -f "$OUTPUT_PATH" ]; then
    # OUTPUT above should make linuxdeploy-plugin-appimage write straight to
    # OUTPUT_PATH, but fall back to finding whatever it actually produced
    # (its default naming is <app>-<arch>.AppImage in the cwd) rather than
    # failing outright on a naming-convention mismatch between plugin
    # versions.
    produced=$(find . -maxdepth 1 -name '*.AppImage' -newer "$APPDIR/AppRun" | head -1)
    if [ -z "$produced" ]; then
        echo "linuxdeploy did not produce an AppImage" >&2
        exit 1
    fi
    mv "$produced" "$OUTPUT_PATH"
fi

# appimagetool's zsync sidecar does not follow the DESTINATION argument's
# directory the way the .AppImage itself does - even when OUTPUT_PATH above
# was honored directly, the .zsync still lands next to appimagetool's own
# default output name (broke the release lane silently on 2026-09-23: the
# AppImage published fine, but the .zsync never reached release-assets/, so
# the publish job's asset count stayed one short forever). Find whatever was
# actually produced and move it alongside OUTPUT_PATH.
if [ ! -f "${OUTPUT_PATH}.zsync" ]; then
    produced_zsync=$(find . -maxdepth 1 -name '*.AppImage.zsync' -newer "$APPDIR/AppRun" | head -1)
    if [ -z "$produced_zsync" ]; then
        echo "appimagetool did not produce a .zsync sidecar" >&2
        exit 1
    fi
    mv "$produced_zsync" "${OUTPUT_PATH}.zsync"
fi

echo "Built: $OUTPUT_PATH (v${VERSION})"
ls -la "$(dirname "$OUTPUT_PATH")"
