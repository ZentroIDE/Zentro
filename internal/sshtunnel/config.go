// SPDX-License-Identifier: GPL-3.0-only

// Package sshtunnel lets a database driver reach its server through an SSH
// jump host. Instead of opening a local listening port it hands the driver a
// dialer: each database connection becomes a "direct-tcpip" channel on one
// shared SSH client, so the profile keeps its real host name (TLS server-name
// checks still work) and there are no ephemeral ports to leak.
package sshtunnel

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net"
	"strconv"
	"strings"

	"zentro/internal/models"
)

// Authentication methods a tunnel can use.
const (
	AuthPassword = "password"
	AuthKey      = "key"
	AuthAgent    = "agent"
)

// DefaultPort is the SSH port used when a profile leaves it unset.
const DefaultPort = 22

// Config is everything needed to open (and identify) one SSH connection.
type Config struct {
	Host       string
	Port       int
	User       string
	Auth       string
	KeyPath    string
	Password   string
	Passphrase string
}

// ConfigFromProfile extracts the tunnel settings from a connection profile.
// The bool is false when the profile does not use a tunnel.
func ConfigFromProfile(p *models.ConnectionProfile) (Config, bool) {
	if p == nil || !p.SSHEnabled {
		return Config{}, false
	}
	cfg := Config{
		Host:       strings.TrimSpace(p.SSHHost),
		Port:       p.SSHPort,
		User:       strings.TrimSpace(p.SSHUser),
		Auth:       strings.TrimSpace(p.SSHAuth),
		KeyPath:    strings.TrimSpace(p.SSHKeyPath),
		Password:   p.SSHPassword,
		Passphrase: p.SSHPassphrase,
	}
	if cfg.Port <= 0 {
		cfg.Port = DefaultPort
	}
	if cfg.Auth == "" {
		cfg.Auth = AuthPassword
	}
	return cfg, true
}

func (c Config) addr() string {
	return net.JoinHostPort(c.Host, strconv.Itoa(c.Port))
}

// cacheKey identifies the SSH connection a config would use. Secrets are
// hashed in so changing a password opens a fresh connection, without keeping
// the secret in a map key.
func (c Config) cacheKey() string {
	sum := sha256.Sum256([]byte(c.Password + "\x00" + c.Passphrase))
	return strings.Join([]string{c.addr(), c.User, c.Auth, c.KeyPath, hex.EncodeToString(sum[:8])}, "|")
}

func (c Config) validate() error {
	if c.Host == "" {
		return tunnelErr("the SSH host is empty")
	}
	if c.User == "" {
		return tunnelErr("the SSH user is empty")
	}
	switch c.Auth {
	case AuthPassword:
		if c.Password == "" {
			return tunnelErr("the SSH password is empty")
		}
	case AuthKey:
		if c.KeyPath == "" {
			return tunnelErr("no SSH private key file is set")
		}
	case AuthAgent:
	default:
		return tunnelErr("unknown SSH authentication method %q (use password, key or agent)", c.Auth)
	}
	return nil
}

// tunnelErr builds an error whose text already reads well in the UI. The
// "ssh tunnel" prefix is also how Explain recognises these errors after a
// database driver has wrapped them.
func tunnelErr(format string, args ...any) error {
	return fmt.Errorf("ssh tunnel: "+format, args...)
}

// Explain returns err as a tunnel error when it came from this package (even
// if a driver wrapped it), and nil otherwise, so a driver's FriendlyError can
// show it without its own "postgres: " style prefix.
func Explain(err error) error {
	if err == nil {
		return nil
	}
	msg := err.Error()
	if i := strings.Index(msg, "ssh tunnel: "); i >= 0 {
		return fmt.Errorf("%s", msg[i:])
	}
	return nil
}
