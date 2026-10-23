// SPDX-License-Identifier: GPL-3.0-only

package app

// What a build adds to the core.
//
// The core defines the places an edition plugs into and nothing else knows such
// an edition exists. A file that belongs to it (pro_*.go, ADR 0019) registers
// its parts from init(); a tree without those files registers nothing and the
// App runs on the core's own defaults.
//
// The registries are filled while packages initialise and only read afterwards,
// so they need no lock.
var (
	wiringHooks   []func(*App)
	startupHooks  []func(*App)
	shutdownHooks []func(*App)
)

// onWire registers a hook that runs at the end of NewApp, once the core
// services exist. Use it to replace a default (for example the entitlements)
// or to add a service.
func onWire(hook func(*App)) { wiringHooks = append(wiringHooks, hook) }

// onStartup registers a hook that runs at the end of Startup.
func onStartup(hook func(*App)) { startupHooks = append(startupHooks, hook) }

// onShutdown registers a hook that runs at the start of Shutdown.
func onShutdown(hook func(*App)) { shutdownHooks = append(shutdownHooks, hook) }

func (a *App) runWiringHooks() {
	for _, hook := range wiringHooks {
		hook(a)
	}
}

func (a *App) runStartupHooks() {
	for _, hook := range startupHooks {
		hook(a)
	}
}

func (a *App) runShutdownHooks() {
	for _, hook := range shutdownHooks {
		hook(a)
	}
}
