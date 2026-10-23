// SPDX-License-Identifier: GPL-3.0-only

package sshtunnel

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/pem"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
)

// testServer is an in-process SSH server that accepts one password (and,
// optionally, one public key) and proxies direct-tcpip channels.
type testServer struct {
	addr     string
	port     int
	hostKey  ssh.Signer
	listener net.Listener
}

func newHostKey(t *testing.T) ssh.Signer {
	t.Helper()
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := ssh.NewSignerFromKey(priv)
	if err != nil {
		t.Fatal(err)
	}
	return signer
}

func startSSHServer(t *testing.T, password string, authorized ssh.PublicKey) *testServer {
	t.Helper()
	hostKey := newHostKey(t)
	cfg := &ssh.ServerConfig{
		PasswordCallback: func(c ssh.ConnMetadata, pw []byte) (*ssh.Permissions, error) {
			if c.User() == "tunnel" && string(pw) == password {
				return nil, nil
			}
			return nil, io.EOF
		},
		PublicKeyCallback: func(c ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) {
			if authorized != nil && c.User() == "tunnel" && string(key.Marshal()) == string(authorized.Marshal()) {
				return nil, nil
			}
			return nil, io.EOF
		},
	}
	cfg.AddHostKey(hostKey)

	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = l.Close() })

	go func() {
		for {
			nc, err := l.Accept()
			if err != nil {
				return
			}
			go serveSSHConn(nc, cfg)
		}
	}()

	port := l.Addr().(*net.TCPAddr).Port
	return &testServer{addr: l.Addr().String(), port: port, hostKey: hostKey, listener: l}
}

func serveSSHConn(nc net.Conn, cfg *ssh.ServerConfig) {
	conn, chans, reqs, err := ssh.NewServerConn(nc, cfg)
	if err != nil {
		_ = nc.Close()
		return
	}
	defer conn.Close()
	go ssh.DiscardRequests(reqs)
	for newCh := range chans {
		if newCh.ChannelType() == "session" {
			go serveShellSession(newCh)
			continue
		}
		if newCh.ChannelType() != "direct-tcpip" {
			_ = newCh.Reject(ssh.UnknownChannelType, "unsupported")
			continue
		}
		var req struct {
			Host     string
			Port     uint32
			OrigAddr string
			OrigPort uint32
		}
		if err := ssh.Unmarshal(newCh.ExtraData(), &req); err != nil {
			_ = newCh.Reject(ssh.ConnectionFailed, "bad payload")
			continue
		}
		target, err := net.Dial("tcp", net.JoinHostPort(req.Host, strconv.Itoa(int(req.Port))))
		if err != nil {
			_ = newCh.Reject(ssh.ConnectionFailed, err.Error())
			continue
		}
		ch, chReqs, err := newCh.Accept()
		if err != nil {
			_ = target.Close()
			continue
		}
		go ssh.DiscardRequests(chReqs)
		go func() {
			defer ch.Close()
			defer target.Close()
			go io.Copy(target, ch)
			io.Copy(ch, target)
		}()
	}
}

// windowChanges records the sizes the server was told about, newest last.
var (
	windowChangeMu sync.Mutex
	windowChanges  [][2]uint32 // cols, rows
)

// serveShellSession accepts pty-req/window-change/shell and then echoes what it
// is sent back with a prefix, standing in for a remote login shell.
func serveShellSession(newCh ssh.NewChannel) {
	ch, reqs, err := newCh.Accept()
	if err != nil {
		return
	}
	for req := range reqs {
		switch req.Type {
		case "pty-req", "env":
			_ = req.Reply(true, nil)
		case "window-change":
			var w struct{ Cols, Rows, PixW, PixH uint32 }
			if ssh.Unmarshal(req.Payload, &w) == nil {
				windowChangeMu.Lock()
				windowChanges = append(windowChanges, [2]uint32{w.Cols, w.Rows})
				windowChangeMu.Unlock()
			}
			_ = req.Reply(true, nil)
		case "shell":
			_ = req.Reply(true, nil)
			go func() {
				defer ch.Close()
				_, _ = ch.Write([]byte("welcome\r\n"))
				buf := make([]byte, 256)
				for {
					n, err := ch.Read(buf)
					if n > 0 {
						_, _ = ch.Write(append([]byte("echo:"), buf[:n]...))
					}
					if err != nil {
						return
					}
				}
			}()
		default:
			_ = req.Reply(false, nil)
		}
	}
}

// startEchoServer returns the address of a TCP server that echoes what it reads.
func startEchoServer(t *testing.T) string {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = l.Close() })
	go func() {
		for {
			c, err := l.Accept()
			if err != nil {
				return
			}
			go func() {
				defer c.Close()
				io.Copy(c, c)
			}()
		}
	}()
	return l.Addr().String()
}

func newTestManager(t *testing.T) (*Manager, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "ssh_known_hosts")
	m := NewManager(path)
	t.Cleanup(m.Close)
	return m, path
}

func passwordConfig(srv *testServer, password string) Config {
	return Config{Host: "127.0.0.1", Port: srv.port, User: "tunnel", Auth: AuthPassword, Password: password}
}

func roundTrip(t *testing.T, conn net.Conn) {
	t.Helper()
	_ = conn.SetDeadline(time.Now().Add(5 * time.Second))
	if _, err := conn.Write([]byte("ping")); err != nil {
		t.Fatalf("write: %v", err)
	}
	buf := make([]byte, 4)
	if _, err := io.ReadFull(conn, buf); err != nil {
		t.Fatalf("read: %v", err)
	}
	if string(buf) != "ping" {
		t.Fatalf("echo = %q, want ping", buf)
	}
}

func TestDialContextPasswordAuthReachesTarget(t *testing.T) {
	srv := startSSHServer(t, "s3cret", nil)
	echo := startEchoServer(t)
	m, _ := newTestManager(t)

	conn, err := m.DialContext(context.Background(), passwordConfig(srv, "s3cret"), "tcp", echo)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	roundTrip(t, conn)
}

func TestDialContextWrongPasswordIsExplained(t *testing.T) {
	srv := startSSHServer(t, "s3cret", nil)
	m, _ := newTestManager(t)

	_, err := m.DialContext(context.Background(), passwordConfig(srv, "nope"), "tcp", "127.0.0.1:1")
	if err == nil {
		t.Fatal("expected an authentication error")
	}
	if !strings.Contains(err.Error(), "ssh tunnel: authentication") {
		t.Fatalf("error = %v, want an ssh tunnel authentication message", err)
	}
	if Explain(err) == nil {
		t.Error("Explain must recognise the tunnel error")
	}
}

func TestDialContextKeyAuth(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	signer, _ := ssh.NewSignerFromKey(priv)
	block, err := ssh.MarshalPrivateKey(priv, "")
	if err != nil {
		t.Fatal(err)
	}
	_ = pub
	keyPath := filepath.Join(t.TempDir(), "id_ed25519")
	if err := os.WriteFile(keyPath, pem.EncodeToMemory(block), 0o600); err != nil {
		t.Fatal(err)
	}

	srv := startSSHServer(t, "unused", signer.PublicKey())
	echo := startEchoServer(t)
	m, _ := newTestManager(t)

	cfg := Config{Host: "127.0.0.1", Port: srv.port, User: "tunnel", Auth: AuthKey, KeyPath: keyPath}
	conn, err := m.DialContext(context.Background(), cfg, "tcp", echo)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	roundTrip(t, conn)
}

func TestHostKeyIsPinnedAfterFirstUseAndNotTruncated(t *testing.T) {
	srv := startSSHServer(t, "s3cret", nil)
	echo := startEchoServer(t)
	m, knownHosts := newTestManager(t)

	c1, err := m.DialContext(context.Background(), passwordConfig(srv, "s3cret"), "tcp", echo)
	if err != nil {
		t.Fatal(err)
	}
	c1.Close()
	first, err := os.ReadFile(knownHosts)
	if err != nil || len(first) == 0 {
		t.Fatalf("known_hosts after first use = %q, %v; want one recorded key", first, err)
	}

	// A new manager (fresh connection) against the same file must accept the
	// pinned key and leave the file untouched.
	m2 := NewManager(knownHosts)
	defer m2.Close()
	c2, err := m2.DialContext(context.Background(), passwordConfig(srv, "s3cret"), "tcp", echo)
	if err != nil {
		t.Fatal(err)
	}
	c2.Close()
	second, _ := os.ReadFile(knownHosts)
	if string(second) != string(first) {
		t.Fatalf("known_hosts changed on a repeat connection:\nbefore: %q\nafter:  %q", first, second)
	}
}

func TestChangedHostKeyIsRefused(t *testing.T) {
	srv := startSSHServer(t, "s3cret", nil)
	m, knownHosts := newTestManager(t)

	// Pin a different key for this address, as if the server had been replaced.
	other := newHostKey(t)
	line := "[127.0.0.1]:" + strconv.Itoa(srv.port) + " " + string(ssh.MarshalAuthorizedKey(other.PublicKey()))
	if err := os.WriteFile(knownHosts, []byte(line), 0o600); err != nil {
		t.Fatal(err)
	}

	_, err := m.DialContext(context.Background(), passwordConfig(srv, "s3cret"), "tcp", "127.0.0.1:1")
	if err == nil || !strings.Contains(err.Error(), "CHANGED") {
		t.Fatalf("error = %v, want a host-key-changed refusal", err)
	}
}

func TestSharedClientIsReusedAndClosedWhenIdle(t *testing.T) {
	srv := startSSHServer(t, "s3cret", nil)
	echo := startEchoServer(t)
	m, _ := newTestManager(t)
	m.idleClose = 50 * time.Millisecond

	cfg := passwordConfig(srv, "s3cret")
	c1, err := m.DialContext(context.Background(), cfg, "tcp", echo)
	if err != nil {
		t.Fatal(err)
	}
	c2, err := m.DialContext(context.Background(), cfg, "tcp", echo)
	if err != nil {
		t.Fatal(err)
	}
	if n := entryCount(m); n != 1 {
		t.Fatalf("entries = %d, want one shared SSH client", n)
	}
	roundTrip(t, c1)
	roundTrip(t, c2)

	c1.Close()
	c2.Close()
	deadline := time.Now().Add(3 * time.Second)
	for entryCount(m) != 0 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if n := entryCount(m); n != 0 {
		t.Fatalf("entries after idle = %d, want 0", n)
	}
}

func TestUnreachableTargetIsExplained(t *testing.T) {
	srv := startSSHServer(t, "s3cret", nil)
	m, _ := newTestManager(t)

	// Port 1 on localhost is closed, so the SSH server's dial is refused.
	_, err := m.DialContext(context.Background(), passwordConfig(srv, "s3cret"), "tcp", "127.0.0.1:1")
	if err == nil || !strings.Contains(err.Error(), "could not connect to 127.0.0.1:1") {
		t.Fatalf("error = %v, want a target-unreachable message", err)
	}
}

func TestValidateRejectsIncompleteConfig(t *testing.T) {
	cases := map[string]Config{
		"no host":     {User: "u", Auth: AuthPassword, Password: "p", Port: 22},
		"no user":     {Host: "h", Auth: AuthPassword, Password: "p", Port: 22},
		"no password": {Host: "h", User: "u", Auth: AuthPassword, Port: 22},
		"no key path": {Host: "h", User: "u", Auth: AuthKey, Port: 22},
		"bad method":  {Host: "h", User: "u", Auth: "magic", Port: 22},
	}
	for name, cfg := range cases {
		if err := cfg.validate(); err == nil {
			t.Errorf("%s: validate() = nil, want error", name)
		}
	}
	if err := (Config{Host: "h", User: "u", Auth: AuthAgent, Port: 22}).validate(); err != nil {
		t.Errorf("agent auth needs no secret, got %v", err)
	}
}

func TestCacheKeyChangesWithSecret(t *testing.T) {
	a := Config{Host: "h", Port: 22, User: "u", Auth: AuthPassword, Password: "one"}
	b := a
	b.Password = "two"
	if a.cacheKey() == b.cacheKey() {
		t.Fatal("different passwords must not share an SSH connection")
	}
	if strings.Contains(a.cacheKey(), "one") {
		t.Fatal("cache key must not contain the secret")
	}
}

func entryCount(m *Manager) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.entries)
}
