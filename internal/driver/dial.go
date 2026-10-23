// SPDX-License-Identifier: GPL-3.0-only

package driver

import (
	"context"
	"net"
	"time"

	"zentro/internal/models"
)

// DialFunc opens the network connection a driver uses to reach its server.
type DialFunc func(ctx context.Context, network, addr string) (net.Conn, error)

// DialProvider returns the dialer a profile's connections must use, or nil to
// keep the driver's own default. It is how an SSH tunnel (and anything else
// that has to sit under the connection) plugs into a driver without the driver
// knowing about it. A nil provider means "never customise".
type DialProvider func(p *models.ConnectionProfile) DialFunc

// DialerFor returns the custom dialer for p, or nil when there is none.
func (dp DialProvider) DialerFor(p *models.ConnectionProfile) DialFunc {
	if dp == nil {
		return nil
	}
	return dp(p)
}

// DialContext lets a DialFunc satisfy interfaces that want a DialContext method
// (go-mssqldb's Dialer).
func (f DialFunc) DialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	return f(ctx, network, addr)
}

// DirectDial is the plain TCP dialer used underneath wrappers that only add
// behaviour (such as traffic metering) to a profile that has no tunnel.
func DirectDial(p *models.ConnectionProfile) DialFunc {
	timeout := time.Duration(p.ConnectTimeout) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	d := net.Dialer{Timeout: timeout, KeepAlive: 15 * time.Second}
	return d.DialContext
}
