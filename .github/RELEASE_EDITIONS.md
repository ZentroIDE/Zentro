
---

## Which download should I pick?

Every release of Zentro comes in two editions, both from this repository.

| | **Zentro** (official build) | **Zentro Community Edition (CE)** |
|---|---|---|
| What it is | The build served at [zentro-ide.com/downloads](https://zentro-ide.com/downloads): the free core plus the Pro features, which unlock with a plan or the 30-day trial | The free core only, built from the source in this repository |
| Pro features | Included, locked until you start the trial or have a plan | Not included. Their source is not in this repository |
| License | Core: GPL-3.0-only. Pro: separate commercial license | GPL-3.0-only |
| Built by | The project's release pipeline. Windows binaries are code-signed | GitHub Actions in this public repository, straight from this release's tag. Unsigned |
| Updates | In-app updater | None: download the next release |
| File names | `zentro-v{{VERSION}}-…` | `zentro-ce-v{{VERSION}}-…` |

**Not sure? Take the official build.** It is free to use, needs no account, and includes the 30-day Pro trial.
Pick CE if you want a binary that is built in the open from the exact source you can read.

### Official build

- Windows: `zentro-v{{VERSION}}-windows-amd64-installer.exe` (installer) or `zentro-v{{VERSION}}-windows-amd64.exe` (portable)
- macOS: `zentro-v{{VERSION}}-macos-universal.pkg` or `.zip`
- Linux: `zentro-v{{VERSION}}-linux-amd64.AppImage`, `.deb`, or `zentro-v{{VERSION}}-fedora-amd64.rpm`

### Community Edition

- Windows: `zentro-ce-v{{VERSION}}-windows-amd64.exe` (portable)
- macOS: `zentro-ce-v{{VERSION}}-macos-universal.zip`
- Linux: `zentro-ce-v{{VERSION}}-linux-amd64.deb` (package `zentro-ce`, which conflicts with the official `zentro` package)
- `SHA256SUMS-ce.txt` lists the checksum of every CE file

The CE files are attached by an automated build a few minutes after the release is published, so they may not be
listed yet right after the release goes out. Because they are unsigned, Windows SmartScreen and macOS Gatekeeper
will warn on first launch; compare the checksum with `SHA256SUMS-ce.txt` before you run one. You can also build CE
yourself, see the README.
