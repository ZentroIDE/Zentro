// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"zentro/internal/core"
	pluginext "zentro/internal/extensions/plugin"
)

func (a *App) RegisterPluginContribution(c pluginext.Contribution) error {
	return a.svc.PluginReg.Register(c)
}

func (a *App) ResolvePluginContribution(id string) (pluginext.Contribution, bool) {
	return a.svc.PluginReg.Resolve(id)
}

func (a *App) ListPluginByCapability(capability string) []pluginext.Contribution {
	return a.svc.PluginReg.ListByCapability(pluginext.Capability(capability))
}

func (a *App) SetPendingQueryAuditMeta(tabID string, meta QueryAuditMeta) {
	if a.svc.Query == nil {
		return
	}
	a.svc.Query.SetPendingAuditMeta(tabID, meta)
}

func (a *App) ListDriverDescriptors() []core.DriverDescriptor {
	return core.DriverDescriptors()
}
