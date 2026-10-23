// SPDX-License-Identifier: GPL-3.0-only

package sshtunnel

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"
)

func readUntil(t *testing.T, r io.Reader, want string) string {
	t.Helper()
	var got strings.Builder
	buf := make([]byte, 256)
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		n, err := r.Read(buf)
		got.Write(buf[:n])
		if strings.Contains(got.String(), want) {
			return got.String()
		}
		if err != nil {
			break
		}
	}
	t.Fatalf("output %q never contained %q", got.String(), want)
	return ""
}

func TestOpenShellRoundTripsInputAndOutput(t *testing.T) {
	srv := startSSHServer(t, "s3cret", nil)
	m, _ := newTestManager(t)

	shell, err := m.OpenShell(context.Background(), passwordConfig(srv, "s3cret"), 100, 30)
	if err != nil {
		t.Fatal(err)
	}
	defer shell.Close()

	readUntil(t, shell, "welcome")
	if _, err := shell.Write([]byte("ls\n")); err != nil {
		t.Fatal(err)
	}
	readUntil(t, shell, "echo:ls")
}

func TestShellResizeReachesTheServer(t *testing.T) {
	srv := startSSHServer(t, "s3cret", nil)
	m, _ := newTestManager(t)
	windowChangeMu.Lock()
	windowChanges = nil
	windowChangeMu.Unlock()

	shell, err := m.OpenShell(context.Background(), passwordConfig(srv, "s3cret"), 80, 24)
	if err != nil {
		t.Fatal(err)
	}
	defer shell.Close()
	readUntil(t, shell, "welcome")

	if err := shell.Resize(132, 43); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		windowChangeMu.Lock()
		n := len(windowChanges)
		last := [2]uint32{}
		if n > 0 {
			last = windowChanges[n-1]
		}
		windowChangeMu.Unlock()
		if last == [2]uint32{132, 43} {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("the server never saw the 132x43 window change")
}

func TestShellWaitReturnsWhenTheShellEnds(t *testing.T) {
	srv := startSSHServer(t, "s3cret", nil)
	m, _ := newTestManager(t)

	shell, err := m.OpenShell(context.Background(), passwordConfig(srv, "s3cret"), 80, 24)
	if err != nil {
		t.Fatal(err)
	}
	readUntil(t, shell, "welcome")

	done := make(chan error, 1)
	go func() {
		_, err := shell.Wait(context.Background())
		done <- err
	}()
	_ = shell.Close()

	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("Wait = %v, want nil after the shell ended", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("Wait did not return after Close")
	}
}

func TestShellKeepsTheSharedConnectionAliveUntilClosed(t *testing.T) {
	srv := startSSHServer(t, "s3cret", nil)
	m, _ := newTestManager(t)
	m.idleClose = 30 * time.Millisecond

	shell, err := m.OpenShell(context.Background(), passwordConfig(srv, "s3cret"), 80, 24)
	if err != nil {
		t.Fatal(err)
	}
	readUntil(t, shell, "welcome")

	// An open shell holds a reference, so the idle timer must not close the client.
	time.Sleep(150 * time.Millisecond)
	if n := entryCount(m); n != 1 {
		t.Fatalf("entries while the shell is open = %d, want 1", n)
	}

	_ = shell.Close()
	deadline := time.Now().Add(3 * time.Second)
	for entryCount(m) != 0 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if n := entryCount(m); n != 0 {
		t.Fatalf("entries after the shell closed = %d, want 0", n)
	}
}

func TestOpenShellRejectsABadPasswordWithATunnelError(t *testing.T) {
	srv := startSSHServer(t, "s3cret", nil)
	m, _ := newTestManager(t)

	_, err := m.OpenShell(context.Background(), passwordConfig(srv, "wrong"), 80, 24)
	if err == nil || !strings.Contains(err.Error(), "ssh tunnel: authentication") {
		t.Fatalf("error = %v, want an ssh tunnel authentication message", err)
	}
}
