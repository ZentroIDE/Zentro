# ADR 0012 — SSH tunnel as a dial provider (no local port)

## Status

Accepted.

## Context

Databases behind a firewall or inside a private network are reached through an
SSH jump host. The common implementation opens a local listener on
`127.0.0.1:<port>`, rewrites the profile to point at it, and connects there.
That has three costs for Zentro:

- TLS `verify-full` and SNI check the host name, which becomes `127.0.0.1`.
- Every connection needs an ephemeral port and a listener whose lifetime has to
  be tied to something, while all `OpenConnection` callers simply `Close()` the
  `*sql.DB` they get back.
- DNS for an internal host name must happen on the far side.

## Decision

The tunnel is a **dialer**, not a port. `internal/sshtunnel.Manager` keeps one
shared `*ssh.Client` per (server, user, credentials) and turns each database
connection into a `direct-tcpip` channel on it.

- `driver.DialProvider` (`internal/driver/dial.go`) is the seam: given a
  profile it returns a `DialFunc` or `nil`. The network drivers take it through
  `WithDialProvider` and install it on their native hook — `mssql.Connector.Dialer`
  (wrapped as a `HostDialer` so DNS is left to the SSH side),
  `pgconn.Config.DialFunc` (+ a pass-through `LookupFunc`), and
  `mysql.Config.DialFunc`. `main.go` is the only place that wires the manager in,
  so drivers never import SSH and the `Connector` port is unchanged.
- The profile keeps its real `Host`/`Port`; with a tunnel they mean "the database
  as seen from the SSH server".
- Clients are reference-counted per live connection, closed after five idle
  minutes, kept alive with `keepalive@openssh.com`, and evicted and re-dialed
  once if a pooled client has died.
- **Host keys**: trust on first use, pinned in Zentro's own
  `ssh_known_hosts` (never `~/.ssh/known_hosts`). A changed key is refused with
  an explicit message. There is no prompt yet; a first connection to a new
  server is trusted silently.
- **Auth**: password (incl. keyboard-interactive), private key file (+ passphrase)
  and the SSH agent (Windows OpenSSH pipe, `SSH_AUTH_SOCK` elsewhere). Pageant is
  not supported.
- **Secrets**: `ssh_password` and `ssh_passphrase` live in the OS keyring under
  `<id>#ssh_password` / `<id>#ssh_passphrase`, follow the existing "Save
  password" flag, are stripped from `config.json` and bundle exports, and are
  kept when a save carries none (same rule as the database password).

## Consequences

- The same provider seam is where traffic metering composes with the tunnel, so
  both work together without either knowing about the other.
- A profile can only tunnel TCP databases; SQLite is unaffected.
- Because trust-on-first-use accepts an unknown server silently, a hostile
  network on the very first connection could pin the wrong key. A confirmation
  prompt (fingerprint shown to the user) is the follow-up if that matters.
