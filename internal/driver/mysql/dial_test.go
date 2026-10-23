// SPDX-License-Identifier: GPL-3.0-only

package mysql

import (
	"context"
	"errors"
	"net"
	"strings"
	"testing"
	"time"

	"zentro/internal/driver"
	"zentro/internal/models"
)

func TestOpenDialsThroughProvider(t *testing.T) {
	var gotAddr string
	provider := func(*models.ConnectionProfile) driver.DialFunc {
		return func(_ context.Context, _, addr string) (net.Conn, error) {
			gotAddr = addr
			return nil, errors.New("dial-hook-called")
		}
	}
	p := testProfile("disable")
	p.Host = "db.internal"

	db, err := New().WithDialProvider(provider).Open(p)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	err = db.PingContext(ctx)
	if err == nil || !strings.Contains(err.Error(), "dial-hook-called") {
		t.Fatalf("ping error = %v, want the dial hook's error", err)
	}
	if gotAddr != "db.internal:3306" {
		t.Fatalf("dialed %q, want the unresolved host:port db.internal:3306", gotAddr)
	}
}
