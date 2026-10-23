// SPDX-License-Identifier: GPL-3.0-only

package netmeter

import (
	"context"
	"io"
	"net"
	"testing"

	"zentro/internal/driver"
	"zentro/internal/models"
)

func echoServer(t *testing.T) string {
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

func TestWrapCountsBytesInBothDirectionsOnDirectProfiles(t *testing.T) {
	addr := echoServer(t)
	var meter Meter
	provider := meter.Wrap(nil) // nil base: nothing custom, so dial directly

	dial := provider(&models.ConnectionProfile{ConnectTimeout: 5})
	if dial == nil {
		t.Fatal("a metered provider must dial even profiles with no tunnel")
	}
	conn, err := dial(context.Background(), "tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()

	if _, err := conn.Write([]byte("hello")); err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 5)
	if _, err := io.ReadFull(conn, buf); err != nil {
		t.Fatal(err)
	}

	rx, tx := meter.Totals()
	if rx != 5 || tx != 5 {
		t.Fatalf("totals = rx %d, tx %d; want 5 and 5", rx, tx)
	}
}

func TestWrapMetersTheBaseDialerWhenOneExists(t *testing.T) {
	addr := echoServer(t)
	var meter Meter
	called := false
	base := func(*models.ConnectionProfile) driver.DialFunc {
		return func(ctx context.Context, network, a string) (net.Conn, error) {
			called = true
			var d net.Dialer
			return d.DialContext(ctx, network, a)
		}
	}

	dial := meter.Wrap(base)(&models.ConnectionProfile{})
	conn, err := dial(context.Background(), "tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_, _ = conn.Write([]byte("abc"))
	buf := make([]byte, 3)
	_, _ = io.ReadFull(conn, buf)

	if !called {
		t.Error("the base (tunnel) dialer must still be used")
	}
	if rx, tx := meter.Totals(); rx != 3 || tx != 3 {
		t.Errorf("totals = %d/%d, want 3/3", rx, tx)
	}
}

func TestWrapDialErrorsPassThrough(t *testing.T) {
	var meter Meter
	dial := meter.Wrap(nil)(&models.ConnectionProfile{ConnectTimeout: 1})
	if _, err := dial(context.Background(), "tcp", "127.0.0.1:1"); err == nil {
		t.Fatal("expected a connection error")
	}
}

func TestNilMeterReturnsBaseUnchanged(t *testing.T) {
	var m *Meter
	if got := m.Wrap(nil); got != nil {
		t.Fatal("a nil Meter must not wrap anything")
	}
}
