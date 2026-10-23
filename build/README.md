# Build Directory

The build directory is used to house all the build files and assets for your application. 

The structure is:

* bin - Output directory
* darwin - macOS specific files
* windows - Windows specific files

## Sprint 13 Release Matrix

Use the release matrix script to build all supported targets:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\release-matrix.ps1
```

This script builds:
- `windows/amd64` (with NSIS installer by default)
- `darwin/universal`
- `linux/amd64`

Use `-NoInstaller` to skip NSIS packaging on Windows.

## Mac

The `darwin` directory holds files specific to Mac builds.
These may be customised and used as part of the build. To return these files to the default state, simply delete them
and
build with `wails build`.

The directory contains the following files:

- `Info.plist` - the main plist file used for Mac builds. It is used when building using `wails build`.
- `Info.dev.plist` - same as the main plist file but used when building using `wails dev`.

## Windows

The `windows` directory contains the manifest and rc files used when building with `wails build`.
These may be customised for your application. To return these files to the default state, simply delete them and
build with `wails build`.

- `icon.ico` - The icon used for the application. This is used when building using `wails build`. If you wish to
  use a different icon, simply replace this file with your own. If it is missing, a new `icon.ico` file
  will be created using the `appicon.png` file in the build directory.
- `installer/*` - The files used to create the Windows installer. These are used when building using `wails build`.
- `info.json` - Application details used for Windows builds. The data here will be used by the Windows installer,
  as well as the application itself (right click the exe -> properties -> details)
- `wails.exe.manifest` - The main application manifest file.

## Linux (Fedora/.rpm)

The `linux` directory holds the desktop-integration assets and
[nfpm](https://github.com/goreleaser/nfpm) packaging config used to build the
Fedora `.rpm` in `.github/workflows/release.yml`. Not used by `wails build`
directly — only by the CI packaging step.

- `zentro.desktop` - the `.desktop` entry installed to
  `/usr/share/applications/zentro.desktop`.
- `zentro.png` - the app icon (resized from `appicon.png`), installed to
  `/usr/share/icons/hicolor/512x512/apps/zentro.png`.
- `nfpm.yaml` - nfpm config: file layout, `rpm` dependencies (`gtk3`,
  `webkit2gtk4.1` - Fedora's newer package name, not `webkit2gtk` 4.0), and
  package metadata. The Fedora build lane links against `webkit2gtk4.1`
  (`-tags webkit2_41` at `wails build` time) since Fedora 39+ no longer ships
  `webkit2gtk-4.0`; that's also why this is a separate CI matrix row built
  inside a `fedora:41` container, not a repackage of the Ubuntu Linux binary.
