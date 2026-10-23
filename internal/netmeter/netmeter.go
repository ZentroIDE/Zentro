// SPDX-License-Identifier: GPL-3.0-only

// Package netmeter counts the bytes Zentro's database connections put on the
// wire. It sits in the dial path (see driver.DialProvider), so it sees what
// actually crosses the network - after TLS and through an SSH tunnel - and
// measures only Zentro's own database traffic, not the whole machine.
package netmeter

import (
	"context"
	"net"
	"sync/atomic"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// Meter accumulates bytes received and sent over every connection it wraps.
// The zero value is ready to use and safe for concurrent use.
type Meter struct {
	rx atomic.Uint64
	tx atomic.Uint64
}

// Totals returns the cumulative bytes received and sent since the Meter was
// created. A sampler turns two readings into a rate.
func (m *Meter) Totals() (rx, tx uint64) {
	return m.rx.Load(), m.tx.Load()
}

// Wrap returns a provider whose dialers count their traffic on m. Profiles the
// base provider leaves alone (no tunnel) are dialed directly, so every network
// connection is metered, not just the tunnelled ones. A nil Meter returns base
// unchanged.
func (m *Meter) Wrap(base driver.DialProvider) driver.DialProvider {
	if m == nil {
		return base
	}
	return func(p *models.ConnectionProfile) driver.DialFunc {
		dial := base.DialerFor(p)
		if dial == nil {
			dial = driver.DirectDial(p)
		}
		return func(ctx context.Context, network, addr string) (net.Conn, error) {
			conn, err := dial(ctx, network, addr)
			if err != nil {
				return nil, err
			}
			return &countingConn{Conn: conn, meter: m}, nil
		}
	}
}

type countingConn struct {
	net.Conn
	meter *Meter
}

func (c *countingConn) Read(b []byte) (int, error) {
	n, err := c.Conn.Read(b)
	if n > 0 {
		c.meter.rx.Add(uint64(n))
	}
	return n, err
}

func (c *countingConn) Write(b []byte) (int, error) {
	n, err := c.Conn.Write(b)
	if n > 0 {
		c.meter.tx.Add(uint64(n))
	}
	return n, err
}
