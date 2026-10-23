// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"zentro/internal/core"
	"zentro/internal/models"
	"zentro/internal/utils"
)

// A tool with needsEnv may act on an environment other than the one open in
// the window (T2.x tools take an explicit env argument). resolveEnv is how it
// gets a connection for that environment: its own *sql.DB, never a.db, never
// a.profile, never ConnectionPool (that pool is for pinned tabs; T1.6's Pin
// adds a ref count a one-shot tool call must not touch).
const (
	// envConcurrencyLimit caps how many resolveEnv connections this service
	// holds open at once. An agent asking for many environments in a row
	// cannot open more than this many real connections.
	envConcurrencyLimit = 4
	// envSlotWaitTimeout bounds how long a call waits for a free slot when
	// the limit above is already in use.
	envSlotWaitTimeout = 5 * time.Second
	// envOpenTimeout bounds the connect-and-ping step itself, separately from
	// the slot wait.
	envOpenTimeout = 10 * time.Second
)

// resolvedEnv is one environment's connection. Profile carries no password;
// it exists for display only (meta fields, logs), never to connect with
// again. Close must run exactly once, success or failure, typically from a
// defer right after a successful resolveEnv.
type resolvedEnv struct {
	// Key is the environment this resolved to, after defaulting an empty
	// envKey argument to the one open in the window -- the caller's own
	// echo of which environment a result actually came from.
	Key      string
	Profile  models.ConnectionProfile
	Driver   string
	Database string
	Schema   string
	DB       *sql.DB
	Close    func()
}

// resolveEnv opens a connection for one environment of the open project,
// independent of whatever connection a.db currently holds. envKey empty
// means the environment currently open in the window (so a tool that leaves
// its own optional env argument blank still works today, before any tool
// has one to leave blank).
func (s *AIService) resolveEnv(ctx context.Context, envKey string) (*resolvedEnv, error) {
	key := strings.TrimSpace(envKey)
	if key == "" {
		key = s.envKey()
	}
	if key == "" {
		return nil, failTool(aiCodeEnvRequired, "an environment is required", "Pass env, or open one in Zentro first.")
	}

	project := s.openProject()
	if project == nil {
		return nil, failTool(aiCodeNotConnected, "no project is open", "Open a project in Zentro.")
	}
	var env *models.ProjectEnvironment
	for i := range project.Environments {
		if strings.EqualFold(string(project.Environments[i].Key), key) {
			env = &project.Environments[i]
			break
		}
	}
	if env == nil {
		return nil, failTool(aiCodeEnvNotFound, fmt.Sprintf("there is no environment named %q", key), "Use list_environments to see the environments of this project.")
	}
	connectionRef := strings.TrimSpace(env.ConnectionRef)
	lastDatabase := strings.TrimSpace(env.LastDatabase)
	if connectionRef == "" || lastDatabase == "" {
		return nil, failTool(aiCodeNotConnected, fmt.Sprintf("the %s environment has no connection bound", key), "Bind a connection to it in Zentro, then try again.")
	}

	load := utils.LoadConnections
	if s.loadConnectionsFn != nil {
		load = s.loadConnectionsFn
	}
	profiles, err := load()
	if err != nil {
		return nil, failTool(aiCodeNotConnected, "the saved connections could not be read", "")
	}
	var profile *models.ConnectionProfile
	for _, p := range profiles {
		if p != nil && p.ID == connectionRef {
			profile = p
			break
		}
	}
	if profile == nil {
		return nil, failTool(aiCodeNotConnected, fmt.Sprintf("the connection bound to %s no longer exists", key), "")
	}

	drv, ok := core.Get(profile.Driver)
	if !ok {
		return nil, failTool(aiCodeUnsupportedDriver, fmt.Sprintf("the %s driver is not available", profile.Driver), "")
	}

	if !s.acquireEnvSlot(ctx) {
		return nil, failTool(aiCodeInternal, "too many environment connections are open right now", "Try again in a moment.")
	}

	target := *profile
	target.DBName = lastDatabase

	openCtx, cancel := context.WithTimeout(ctx, envOpenTimeout)
	defer cancel()
	conn, err := drv.Open(&target)
	if err == nil {
		err = conn.PingContext(openCtx)
	}
	if err != nil {
		if conn != nil {
			_ = conn.Close()
		}
		s.releaseEnvSlot()
		// The driver's own error can carry the host, the DSN, or a detail
		// about why auth failed; none of that is repeated here.
		return nil, failTool(aiCodeNotConnected, fmt.Sprintf("could not connect to %s", key), "")
	}

	var closed bool
	closeFn := func() {
		if closed {
			return
		}
		closed = true
		_ = conn.Close()
		s.releaseEnvSlot()
	}

	display := *profile
	display.Password = ""
	display.DBName = lastDatabase

	return &resolvedEnv{
		Key:      key,
		Profile:  display,
		Driver:   profile.Driver,
		Database: publicSchemaName(lastDatabase),
		Schema:   publicSchemaName(env.LastSchema),
		DB:       conn,
		Close:    closeFn,
	}, nil
}

// acquireEnvSlot blocks for at most envSlotWaitTimeout, or until ctx ends,
// whichever is sooner.
func (s *AIService) acquireEnvSlot(ctx context.Context) bool {
	waitCtx, cancel := context.WithTimeout(ctx, envSlotWaitTimeout)
	defer cancel()
	select {
	case s.envSemaphore <- struct{}{}:
		return true
	case <-waitCtx.Done():
		return false
	}
}

func (s *AIService) releaseEnvSlot() {
	select {
	case <-s.envSemaphore:
	default:
	}
}
