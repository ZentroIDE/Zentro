// SPDX-License-Identifier: GPL-3.0-only

package sshtunnel

import (
	"context"
	"net"

	"zentro/internal/driver"
	"zentro/internal/models"
)

// DialProvider adapts the Manager to the driver layer: a profile with an SSH
// tunnel gets a dialer that goes through it, every other profile gets nil and
// keeps its driver's default dialing.
func (m *Manager) DialProvider() driver.DialProvider {
	return func(p *models.ConnectionProfile) driver.DialFunc {
		cfg, ok := ConfigFromProfile(p)
		if !ok {
			return nil
		}
		return func(ctx context.Context, network, addr string) (net.Conn, error) {
			return m.DialContext(ctx, cfg, network, addr)
		}
	}
}
