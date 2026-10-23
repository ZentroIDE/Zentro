// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"log/slog"
	"sync"

	"zentro/internal/extensions/license"
	pluginext "zentro/internal/extensions/plugin"
)

// UserIdentityProvider resolves the current user context for audit and access control.
// Returns empty strings in single-user mode (Free/Pro).
// Team/Enterprise auth layers implement this interface before Startup.
type UserIdentityProvider interface {
	UserID() string // empty string = single-user mode
	UserEmail() string
	UserRole() string // "admin" | "member" | "viewer"; empty for single-user
}

// ExtensionService is the lifecycle contract for plugin-provided services.
// Team/Enterprise packages implement this to hook into App startup/shutdown.
type ExtensionService interface {
	Name() string
	Startup(ctx context.Context, logger *slog.Logger) error
	Shutdown() error
}

// Services holds all App service instances in one place.
// Core services are exported typed fields.
// Plugin-provided services register via RegisterExtension.
// UserIdentity is nil in Free/Pro (single-user); Team/Enterprise set it before Startup.
type Services struct {
	Audit        *SQLAuditLogService
	Tx           *TransactionService
	Conn         *ConnectionService
	Query        *QueryService
	Scripts      *ScriptService
	Templates    *TemplateService
	Bookmarks    *BookmarkService
	ImageColumns *ImageColumnService
	Formatter    *QueryFormatterService
	Update       *UpdateService
	Projects     *ProjectService
	ProjectLock  *ProjectLockService
	SC           *SourceControlService
	SCAuto       *SourceControlAutomationService
	Policy       *EnvironmentPolicyService
	AppLog       *AppLogFile
	License      license.Entitlements
	Security     SecretProtector
	PluginReg    *pluginext.InMemoryRegistry
	Feedback     *FeedbackService
	Jobs         *JobService
	AI           *AIService
	Stats        *StatsService
	Terminal     *TerminalService

	// UserIdentity is nil in Free/Pro (single-user mode).
	// Set by Team/Enterprise auth layer before App.Startup.
	UserIdentity UserIdentityProvider

	extMu      sync.RWMutex
	extensions map[string]ExtensionService
}

// RegisterExtension registers a plugin-provided service.
// Call from team/enterprise packages before App.Startup.
func (s *Services) RegisterExtension(ext ExtensionService) {
	s.extMu.Lock()
	defer s.extMu.Unlock()
	if s.extensions == nil {
		s.extensions = make(map[string]ExtensionService)
	}
	s.extensions[ext.Name()] = ext
}

// GetExtension returns a registered extension by name.
func (s *Services) GetExtension(name string) (ExtensionService, bool) {
	s.extMu.RLock()
	defer s.extMu.RUnlock()
	if s.extensions == nil {
		return nil, false
	}
	ext, ok := s.extensions[name]
	return ext, ok
}

// StartupExtensions calls Startup on all registered extensions.
func (s *Services) StartupExtensions(ctx context.Context, logger *slog.Logger) error {
	s.extMu.RLock()
	exts := make([]ExtensionService, 0, len(s.extensions))
	for _, ext := range s.extensions {
		exts = append(exts, ext)
	}
	s.extMu.RUnlock()
	for _, ext := range exts {
		if err := ext.Startup(ctx, logger); err != nil {
			return err
		}
	}
	return nil
}

// ShutdownExtensions calls Shutdown on all registered extensions.
func (s *Services) ShutdownExtensions() {
	s.extMu.RLock()
	exts := make([]ExtensionService, 0, len(s.extensions))
	for _, ext := range s.extensions {
		exts = append(exts, ext)
	}
	s.extMu.RUnlock()
	for _, ext := range exts {
		ext.Shutdown()
	}
}
