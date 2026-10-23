// SPDX-License-Identifier: GPL-3.0-only

package sshtunnel

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"
	"golang.org/x/crypto/ssh/knownhosts"
)

const (
	connectTimeout    = 15 * time.Second
	defaultIdleClose  = 5 * time.Minute
	keepAliveInterval = 30 * time.Second
)

// Manager owns the SSH connections. One *ssh.Client is shared by every
// database connection that uses the same server, user and credentials, and is
// closed once nothing has used it for a while.
type Manager struct {
	knownHostsPath string
	idleClose      time.Duration

	mu      sync.Mutex
	entries map[string]*entry
	closed  bool

	khMu sync.Mutex // serialises reads/appends of the known-hosts file
}

type entry struct {
	key    string
	client *ssh.Client
	err    error
	ready  chan struct{} // closed once client or err is set
	refs   int
	idle   *time.Timer
}

// NewManager returns a Manager that records trusted host keys in
// knownHostsPath (created on first use).
func NewManager(knownHostsPath string) *Manager {
	return &Manager{
		knownHostsPath: knownHostsPath,
		idleClose:      defaultIdleClose,
		entries:        map[string]*entry{},
	}
}

// DialContext opens a connection to addr (host:port, as the SSH server sees
// it) through the tunnel described by cfg.
func (m *Manager) DialContext(ctx context.Context, cfg Config, network, addr string) (net.Conn, error) {
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	// Two attempts: a pooled client may have died since its last use, in which
	// case it is evicted and replaced once before giving up.
	for attempt := 0; attempt < 2; attempt++ {
		e, err := m.acquire(ctx, cfg)
		if err != nil {
			return nil, err
		}
		conn, err := dialVia(ctx, e.client, network, addr)
		if err == nil {
			return &trackedConn{Conn: conn, release: func() { m.release(e) }}, nil
		}
		m.release(e)

		var openErr *ssh.OpenChannelError
		if errors.As(err, &openErr) {
			return nil, tunnelErr("%s could not connect to %s (%s) - check the database host and port as seen from the SSH server",
				cfg.addr(), addr, openErr.Message)
		}
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		m.evict(e)
	}
	return nil, tunnelErr("lost the SSH connection to %s", cfg.addr())
}

// Close shuts every SSH connection. Database connections riding on them drop.
func (m *Manager) Close() {
	m.mu.Lock()
	m.closed = true
	entries := m.entries
	m.entries = map[string]*entry{}
	m.mu.Unlock()
	for _, e := range entries {
		if e.idle != nil {
			e.idle.Stop()
		}
		if e.client != nil {
			_ = e.client.Close()
		}
	}
}

// acquire returns a ready entry with one reference held for the caller.
func (m *Manager) acquire(ctx context.Context, cfg Config) (*entry, error) {
	key := cfg.cacheKey()

	m.mu.Lock()
	if m.closed {
		m.mu.Unlock()
		return nil, tunnelErr("tunnels are shut down")
	}
	e, ok := m.entries[key]
	if ok {
		e.refs++
		if e.idle != nil {
			e.idle.Stop()
			e.idle = nil
		}
		m.mu.Unlock()
		select {
		case <-e.ready:
		case <-ctx.Done():
			m.release(e)
			return nil, ctx.Err()
		}
		if e.err != nil {
			return nil, e.err
		}
		return e, nil
	}

	e = &entry{key: key, ready: make(chan struct{}), refs: 1}
	m.entries[key] = e
	m.mu.Unlock()

	client, err := m.connect(ctx, cfg)

	m.mu.Lock()
	if err != nil {
		e.err = err
		if m.entries[key] == e {
			delete(m.entries, key)
		}
	} else {
		e.client = client
	}
	close(e.ready)
	m.mu.Unlock()

	if err != nil {
		return nil, err
	}
	go m.watch(e)
	return e, nil
}

func (m *Manager) release(e *entry) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e.refs--
	if e.refs > 0 || e.client == nil || m.closed {
		return
	}
	e.idle = time.AfterFunc(m.idleClose, func() { m.closeIfIdle(e) })
}

func (m *Manager) closeIfIdle(e *entry) {
	m.mu.Lock()
	if e.refs > 0 {
		m.mu.Unlock()
		return
	}
	if m.entries[e.key] == e {
		delete(m.entries, e.key)
	}
	m.mu.Unlock()
	_ = e.client.Close()
}

func (m *Manager) evict(e *entry) {
	m.mu.Lock()
	if m.entries[e.key] == e {
		delete(m.entries, e.key)
	}
	m.mu.Unlock()
	_ = e.client.Close()
}

// watch drops the entry when its SSH connection ends and keeps the link alive
// meanwhile (NAT/firewalls drop idle TCP flows, and a dead peer is detected
// by the failed keepalive).
func (m *Manager) watch(e *entry) {
	done := make(chan struct{})
	go func() {
		_ = e.client.Wait()
		close(done)
	}()
	ticker := time.NewTicker(keepAliveInterval)
	defer ticker.Stop()
	for {
		select {
		case <-done:
			m.mu.Lock()
			if m.entries[e.key] == e {
				delete(m.entries, e.key)
			}
			m.mu.Unlock()
			return
		case <-ticker.C:
			if _, _, err := e.client.SendRequest("keepalive@openssh.com", true, nil); err != nil {
				_ = e.client.Close()
			}
		}
	}
}

func (m *Manager) connect(ctx context.Context, cfg Config) (*ssh.Client, error) {
	methods, cleanup, err := authMethods(cfg)
	if err != nil {
		return nil, err
	}
	defer cleanup()

	sshCfg := &ssh.ClientConfig{
		User:            cfg.User,
		Auth:            methods,
		HostKeyCallback: m.hostKeyCallback(),
		Timeout:         connectTimeout,
	}

	dialer := net.Dialer{Timeout: connectTimeout}
	nc, err := dialer.DialContext(ctx, "tcp", cfg.addr())
	if err != nil {
		return nil, tunnelErr("cannot reach the SSH server %s: %v", cfg.addr(), err)
	}
	// The handshake has no context of its own: bound it by a deadline and by
	// closing the socket if the caller gives up.
	_ = nc.SetDeadline(time.Now().Add(connectTimeout))
	stop := context.AfterFunc(ctx, func() { _ = nc.Close() })
	defer stop()

	conn, chans, reqs, err := ssh.NewClientConn(nc, cfg.addr(), sshCfg)
	if err != nil {
		_ = nc.Close()
		return nil, classifyHandshakeError(cfg, err)
	}
	_ = nc.SetDeadline(time.Time{})
	return ssh.NewClient(conn, chans, reqs), nil
}

func classifyHandshakeError(cfg Config, err error) error {
	var hk *hostKeyError
	if errors.As(err, &hk) {
		return tunnelErr("%s", hk.msg)
	}
	msg := err.Error()
	if strings.Contains(msg, "unable to authenticate") || strings.Contains(msg, "no supported methods remain") {
		return tunnelErr("authentication to %s failed - check the SSH user and %s", cfg.addr(), authHint(cfg.Auth))
	}
	return tunnelErr("handshake with %s failed: %v", cfg.addr(), err)
}

func authHint(auth string) string {
	switch auth {
	case AuthKey:
		return "private key (and passphrase)"
	case AuthAgent:
		return "that your ssh-agent holds an accepted key"
	default:
		return "password"
	}
}

// authMethods builds the ssh auth methods for cfg. cleanup must run once the
// handshake is over (it closes the agent connection when one was opened).
func authMethods(cfg Config) ([]ssh.AuthMethod, func(), error) {
	noop := func() {}
	switch cfg.Auth {
	case AuthKey:
		pem, err := os.ReadFile(expandHome(cfg.KeyPath))
		if err != nil {
			return nil, noop, tunnelErr("cannot read the SSH private key: %v", err)
		}
		signer, err := ssh.ParsePrivateKey(pem)
		var missing *ssh.PassphraseMissingError
		if errors.As(err, &missing) {
			if cfg.Passphrase == "" {
				return nil, noop, tunnelErr("the SSH private key is encrypted - enter its passphrase")
			}
			signer, err = ssh.ParsePrivateKeyWithPassphrase(pem, []byte(cfg.Passphrase))
			if err != nil {
				return nil, noop, tunnelErr("cannot decrypt the SSH private key - wrong passphrase?")
			}
		} else if err != nil {
			return nil, noop, tunnelErr("cannot parse the SSH private key: %v", err)
		}
		return []ssh.AuthMethod{ssh.PublicKeys(signer)}, noop, nil

	case AuthAgent:
		conn, err := dialAgent()
		if err != nil {
			return nil, noop, tunnelErr("cannot reach the ssh-agent: %v", err)
		}
		return []ssh.AuthMethod{ssh.PublicKeysCallback(agent.NewClient(conn).Signers)}, func() { _ = conn.Close() }, nil

	default:
		password := cfg.Password
		return []ssh.AuthMethod{
			ssh.Password(password),
			ssh.KeyboardInteractive(func(_, _ string, questions []string, _ []bool) ([]string, error) {
				answers := make([]string, len(questions))
				for i := range answers {
					answers[i] = password
				}
				return answers, nil
			}),
		}, noop, nil
	}
}

func expandHome(path string) string {
	if strings.HasPrefix(path, "~/") || strings.HasPrefix(path, `~\`) {
		if home, err := os.UserHomeDir(); err == nil {
			return home + path[1:]
		}
	}
	return path
}

// hostKeyError carries a message that is already fit for the user.
type hostKeyError struct{ msg string }

func (e *hostKeyError) Error() string { return e.msg }

// hostKeyCallback trusts a server on first use and pins it afterwards: an
// unknown host is recorded in Zentro's own known-hosts file, while a host whose
// key later differs is refused (that is what a man-in-the-middle looks like).
func (m *Manager) hostKeyCallback() ssh.HostKeyCallback {
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		m.khMu.Lock()
		defer m.khMu.Unlock()

		// knownhosts.New needs the file to exist; create it only when missing so
		// existing pins are never truncated.
		if _, statErr := os.Stat(m.knownHostsPath); os.IsNotExist(statErr) {
			if err := os.WriteFile(m.knownHostsPath, nil, 0o600); err != nil {
				return &hostKeyError{fmt.Sprintf("cannot create the SSH known-hosts file %s: %v", m.knownHostsPath, err)}
			}
		}
		check, err := knownhosts.New(m.knownHostsPath)
		if err != nil {
			return &hostKeyError{fmt.Sprintf("cannot read the SSH known-hosts file %s: %v", m.knownHostsPath, err)}
		}
		err = check(hostname, remote, key)
		if err == nil {
			return nil
		}
		var keyErr *knownhosts.KeyError
		if !errors.As(err, &keyErr) {
			return &hostKeyError{fmt.Sprintf("cannot verify the SSH host key of %s: %v", hostname, err)}
		}
		if len(keyErr.Want) > 0 {
			return &hostKeyError{fmt.Sprintf(
				"the SSH host key of %s has CHANGED since it was first trusted - this can mean someone is intercepting the connection. "+
					"If the server was reinstalled, delete its line from %s and connect again",
				hostname, m.knownHostsPath)}
		}
		return appendKnownHost(m.knownHostsPath, hostname, key)
	}
}

func appendKnownHost(path, hostname string, key ssh.PublicKey) error {
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0o600)
	if err != nil {
		return &hostKeyError{fmt.Sprintf("cannot record the SSH host key in %s: %v", path, err)}
	}
	defer f.Close()
	if _, err := fmt.Fprintln(f, knownhosts.Line([]string{knownhosts.Normalize(hostname)}, key)); err != nil {
		return &hostKeyError{fmt.Sprintf("cannot record the SSH host key in %s: %v", path, err)}
	}
	return nil
}

// dialVia opens a channel to addr on the SSH client, giving up early when ctx
// is cancelled (ssh.Client.Dial itself takes no context).
func dialVia(ctx context.Context, client *ssh.Client, network, addr string) (net.Conn, error) {
	type result struct {
		conn net.Conn
		err  error
	}
	ch := make(chan result, 1)
	go func() {
		c, err := client.Dial(network, addr)
		ch <- result{c, err}
	}()
	select {
	case r := <-ch:
		return r.conn, r.err
	case <-ctx.Done():
		go func() {
			if r := <-ch; r.conn != nil {
				_ = r.conn.Close()
			}
		}()
		return nil, ctx.Err()
	}
}

// trackedConn releases its SSH client reference exactly once when closed.
type trackedConn struct {
	net.Conn
	once    sync.Once
	release func()
}

func (c *trackedConn) Close() error {
	err := c.Conn.Close()
	c.once.Do(c.release)
	return err
}
