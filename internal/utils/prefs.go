// SPDX-License-Identifier: GPL-3.0-only

// Package utils provides config persistence and logging helpers.
// Pattern: Facade — hides file I/O details from callers.
// No dependency on fyne or any UI framework.
package utils

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"zentro/internal/models"
)

// Preferences holds all user-configurable settings.
type ShortcutRule struct {
	ID        string `json:"id"`
	CommandID string `json:"command_id"`
	Binding   string `json:"binding"`
	When      string `json:"when"`
	Source    string `json:"source"`
	Order     int    `json:"order"`
}

// SQLFormatPrefs configures the SQL formatter. Every zero value means "use the
// default", so older config files and a fresh install need no migration.
type SQLFormatPrefs struct {
	KeywordCase   string `json:"keyword_case,omitempty"`    // "upper" (default) | "lower" | "preserve"
	IndentSize    int    `json:"indent_size,omitempty"`     // spaces per level, default 2; ignored with UseTabs
	UseTabs       bool   `json:"use_tabs,omitempty"`        // indent with tabs instead of spaces
	CommaPosition string `json:"comma_position,omitempty"`  // "trailing" (default) | "leading"
	AndOrPosition string `json:"and_or_position,omitempty"` // "leading" (default) | "trailing"
}

// SQLTokenStyle overrides how one kind of SQL token is drawn. An empty Color
// keeps the theme colour, so an entry can restyle only weight/slant.
type SQLTokenStyle struct {
	Color  string `json:"color,omitempty"`  // "#RRGGBB"
	Weight string `json:"weight,omitempty"` // "" (normal) | "semibold" | "bold"
	Italic bool   `json:"italic,omitempty"`
	// Bold is the pre-Weight spelling, still read so an existing config keeps
	// its look; new saves write Weight only.
	Bold bool `json:"bold,omitempty"`
}

// SQLEditorStyle holds per-appearance token style overrides for the SQL
// editor, keyed by category (keyword, string, number, ...). Light and dark are
// separate because a colour readable on one is rarely readable on the other.
type SQLEditorStyle struct {
	Light map[string]SQLTokenStyle `json:"light,omitempty"`
	Dark  map[string]SQLTokenStyle `json:"dark,omitempty"`
	// SchemaHighlight colours table, column and alias names using schema
	// knowledge (decorations rather than the built-in grammar). Off by default.
	SchemaHighlight bool `json:"schema_highlight,omitempty"`
}

type Preferences struct {
	Theme            string            `json:"theme"`              // "light" | "dark" | "system"
	FontSize         int               `json:"font_size"`          // default 14
	FontFamily       string            `json:"font_family"`        // "system" | "inter"
	MonoFamily       string            `json:"mono_family"`        // "system" | "cascadia" | "jetbrains" | "firaCode"
	ThemePresetLight string            `json:"theme_preset_light"` // "light-2026" | "solarized-light" | ...
	ThemePresetDark  string            `json:"theme_preset_dark"`  // "dark-2026" | "solarized-dark" | ...
	AccentColor      string            `json:"accent_color"`       // hex string, "" = use CSS default
	Density          string            `json:"density"`            // "compact" | "comfortable" | "spacious"
	ChunkSize        int               `json:"chunk_size"`         // default 500
	ToastPlacement   string            `json:"toast_placement"`    // default bottom-left
	QueryTimeout     int               `json:"query_timeout"`      // seconds, default 60
	ConnectTimeout   int               `json:"connect_timeout"`    // seconds, default 10
	SchemaTimeout    int               `json:"schema_timeout"`     // seconds, default 15
	ViewMode         bool              `json:"view_mode"`          // default false (read-only DB mode)
	RiskHighlight    bool              `json:"risk_highlight"`     // default true
	Minimap          bool              `json:"minimap"`            // default false
	EditorFocusMode  bool              `json:"editor_focus_mode"`  // default false
	EditorFocusWidth int               `json:"editor_focus_width"` // default 900
	Shortcuts        map[string]string `json:"shortcuts"`
	ShortcutRules    []ShortcutRule    `json:"shortcut_rules"`
	// EnvironmentSafetyLevels maps environment key -> safety level
	// ("strict" | "balanced" | "relaxed"). Missing keys use defaults;
	// production is floored to strict regardless of the stored value.
	EnvironmentSafetyLevels map[string]string `json:"environment_safety_levels,omitempty"`
	// LaunchCount counts app process starts, used to gate the one-time
	// in-app feedback prompt (see FeedbackService).
	LaunchCount int `json:"launch_count,omitempty"`
	// MaxPooledConnections caps how many pinned Table/Catalog tab
	// connections (see ConnectionPool, ADR-0001) can be open at once.
	// 0 falls back to defaultMaxPooledConnections.
	MaxPooledConnections int `json:"max_pooled_connections,omitempty"`
	// FeedbackPromptedAt is set (RFC3339) the moment the feedback prompt is
	// shown, so it never asks twice regardless of how the user responds.
	FeedbackPromptedAt string `json:"feedback_prompted_at,omitempty"`
	// ErrorLens shows diagnostics as text at the end of the affected line.
	// A pointer so an unset value (nil, older config files) means "on" rather
	// than the bool zero value, which would read as "the user turned it off".
	ErrorLens *bool `json:"error_lens,omitempty"`
	// SQLFormat holds the SQL formatter options (see SQLFormatPrefs).
	SQLFormat SQLFormatPrefs `json:"sql_format"`
	// SQLEditorStyle holds the user's SQL syntax colour overrides.
	SQLEditorStyle SQLEditorStyle `json:"sql_editor_style"`
}

// config is the root JSON structure written to disk.
type config struct {
	Preferences Preferences                 `json:"preferences"`
	Connections []*models.ConnectionProfile `json:"connections"`
}

// configDirName returns "zentro" for the stable channel, "zentro-nightly"
// for nightly - so a side-by-side nightly install never shares connections
// or settings with the stable install on the same machine.
func configDirName() string {
	if Channel == "nightly" {
		return "zentro-nightly"
	}
	return "zentro"
}

// configPath returns the path to zentro's config file.
// Creates the directory if it doesn't exist.
func configPath() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("prefs: config dir: %w", err)
	}
	dir := filepath.Join(base, configDirName())
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("prefs: mkdir: %w", err)
	}
	return filepath.Join(dir, "config.json"), nil
}

// loadConfig reads and parses the config file.
// Returns a default config if the file doesn't exist.
// Legacy encrypted config files are still supported for backward compatibility.
func loadConfig() (*config, error) {
	path, err := configPath()
	if err != nil {
		return defaultConfig(), err
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return defaultConfig(), nil
	}
	if err != nil {
		return defaultConfig(), fmt.Errorf("prefs: read: %w", err)
	}

	needsEncryptMigration := false
	needsPasswordMigration := false

	// Try to decrypt first for backward compatibility with legacy encrypted config files.
	plaintext, decryptErr := decryptConfig(data)
	if decryptErr == nil {
		data = plaintext
	} else {
		needsEncryptMigration = true
	}

	var cfg config
	if err := json.Unmarshal(data, &cfg); err != nil {
		// If both encrypted and plaintext fail, return default
		return defaultConfig(), fmt.Errorf("prefs: unmarshal: %w", err)
	}
	// Apply defaults for zero values
	if cfg.Preferences.ChunkSize == 0 {
		cfg.Preferences.ChunkSize = 500
	}
	if cfg.Preferences.FontSize == 0 {
		cfg.Preferences.FontSize = 14
	}
	if cfg.Preferences.Theme == "" {
		cfg.Preferences.Theme = "system"
	}
	if cfg.Preferences.ToastPlacement == "" {
		cfg.Preferences.ToastPlacement = "bottom-left"
	}
	if cfg.Preferences.QueryTimeout == 0 {
		cfg.Preferences.QueryTimeout = 60
	} else if cfg.Preferences.QueryTimeout > 1000000 {
		cfg.Preferences.QueryTimeout /= int(time.Second)
	}

	if cfg.Preferences.ConnectTimeout == 0 {
		cfg.Preferences.ConnectTimeout = 10
	} else if cfg.Preferences.ConnectTimeout > 1000000 {
		cfg.Preferences.ConnectTimeout /= int(time.Second)
	}

	if cfg.Preferences.SchemaTimeout == 0 {
		cfg.Preferences.SchemaTimeout = 15
	} else if cfg.Preferences.SchemaTimeout > 1000000 {
		cfg.Preferences.SchemaTimeout /= int(time.Second)
	}
	if cfg.Preferences.FontFamily == "" {
		cfg.Preferences.FontFamily = "system"
	}
	if cfg.Preferences.MonoFamily == "" {
		cfg.Preferences.MonoFamily = "cascadia"
	}
	if cfg.Preferences.ThemePresetLight == "" {
		cfg.Preferences.ThemePresetLight = "light-2026"
	}
	if cfg.Preferences.ThemePresetDark == "" {
		cfg.Preferences.ThemePresetDark = "dark-2026"
	}
	if cfg.Preferences.Density == "" {
		cfg.Preferences.Density = "compact"
	}
	// AccentColor "" is valid — means use CSS token default
	if cfg.Preferences.EditorFocusWidth == 0 {
		cfg.Preferences.EditorFocusWidth = 900
	}
	if cfg.Preferences.Shortcuts == nil {
		cfg.Preferences.Shortcuts = map[string]string{}
	}
	if cfg.Preferences.ShortcutRules == nil {
		cfg.Preferences.ShortcutRules = []ShortcutRule{}
	}
	// Load passwords from keyring or migrate legacy base64 values.
	for _, p := range cfg.Connections {
		if p.SavePassword && !p.EncryptPassword {
			p.EncryptPassword = true
			needsPasswordMigration = true
		}
		// A blank ID here means this profile predates the ID migration
		// (MigrateConnectionIDs, run once at startup) and hasn't been
		// assigned one yet — its secret, if any, is still under the old
		// Name-keyed slot that migration will move. Skip the ID-keyed
		// lookup rather than querying the keyring for an empty key.
		if p.SavePassword && strings.TrimSpace(p.ID) != "" {
			// First try keyring
			keyringPw, err := GetPassword(p.ID)
			if err == nil && keyringPw != "" {
				p.Password = keyringPw
			} else if keyringPw == "" && p.Password != "" {
				// Fall back to base64 (legacy), then migrate.
				if b, err := base64.StdEncoding.DecodeString(p.Password); err == nil {
					p.Password = string(b)
					needsPasswordMigration = true
				}
			}
		} else {
			p.Password = ""
		}
		hydrateSSHSecrets(p)
	}

	if needsEncryptMigration || needsPasswordMigration {
		if err := saveConfig(&cfg); err != nil {
			// Migration is best-effort. The config was already loaded successfully,
			// so callers should keep working even if a concurrent writer temporarily
			// prevents rewriting the file in the new format.
			return &cfg, nil
		}
	}

	return &cfg, nil
}

// saveConfig writes the config to disk atomically.
// Passwords are stored in OS keyring, not in the config file.
// The config file itself is intentionally stored as plaintext JSON so it remains human-readable.
func saveConfig(cfg *config) error {
	path, err := configPath()
	if err != nil {
		return err
	}
	// Store passwords in keyring and create config without actual passwords.
	//
	// A save that carries no password is never an instruction to forget one:
	// plenty of callers persist the pool from a profile that was never
	// hydrated (SavePreferences, a bundle/tool import whose profiles are
	// credential-free by design, any partially-populated copy). Deleting the
	// keyring secret there silently destroyed the saved password and left
	// save_password=true/encrypt_password=false on disk — which then made
	// loadConfig flag a migration and rewrite (and re-delete) on every single
	// load. Only an explicit "don't save my password" (SavePassword false)
	// removes the secret.
	encoded := make([]*models.ConnectionProfile, len(cfg.Connections))
	for i, p := range cfg.Connections {
		cp := *p
		// ID is the keyring key and the identity ProjectEnvironment.ConnectionRef
		// points to — never persist a connection without one. Every caller
		// should already assign one (SaveConnection, the ID-migration, or
		// NewConnectionProfile), but guaranteeing it here means no write path
		// can ever produce an orphan-prone blank ID.
		if strings.TrimSpace(cp.ID) == "" {
			cp.ID = uuid.NewString()
		}
		switch {
		case cp.SavePassword && cp.Password != "":
			cp.EncryptPassword = true
			if err := StorePassword(cp.ID, cp.Password); err != nil {
				return fmt.Errorf("keyring store: %w", err)
			}
			// Don't store actual password in config
			cp.Password = ""
		case cp.SavePassword:
			// Password not in memory — keep whatever the keyring already holds.
			cp.EncryptPassword = true
			cp.Password = ""
		default:
			cp.Password = ""
			cp.EncryptPassword = false
			if cp.ID != "" {
				if err := DeletePassword(cp.ID); err != nil {
					return fmt.Errorf("keyring delete: %w", err)
				}
			}
		}
		if err := persistSSHSecrets(&cp); err != nil {
			return err
		}
		encoded[i] = &cp
	}
	out := config{Preferences: cfg.Preferences, Connections: encoded}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return fmt.Errorf("prefs: marshal: %w", err)
	}
	data = append(data, '\n')

	// Write to a unique temp file in the same directory, then rename for atomicity.
	tmpFile, err := os.CreateTemp(filepath.Dir(path), "config.json.*.tmp")
	if err != nil {
		return fmt.Errorf("prefs: write: %w", err)
	}
	tmp := tmpFile.Name()
	defer func() {
		_ = os.Remove(tmp)
	}()

	if _, err := tmpFile.Write(data); err != nil {
		_ = tmpFile.Close()
		return fmt.Errorf("prefs: write: %w", err)
	}
	if err := tmpFile.Close(); err != nil {
		return fmt.Errorf("prefs: write: %w", err)
	}

	return os.Rename(tmp, path)
}

func defaultConfig() *config {
	return &config{
		Preferences: Preferences{
			Theme:            "system",
			FontSize:         14,
			FontFamily:       "system",
			MonoFamily:       "cascadia",
			ThemePresetLight: "light-2026",
			ThemePresetDark:  "dark-2026",
			AccentColor:      "",
			Density:          "compact",
			ChunkSize:        500,
			ToastPlacement:   "bottom-left",
			QueryTimeout:     60,
			ConnectTimeout:   10,
			SchemaTimeout:    15,
			ViewMode:         false,
			EditorFocusWidth: 900,
			Shortcuts:        map[string]string{},
			ShortcutRules:    []ShortcutRule{},
		},
		Connections: []*models.ConnectionProfile{},
	}
}

// --- Public API ---

// LoadPreferences reads preferences from disk.
func LoadPreferences() (Preferences, error) {
	cfg, err := loadConfig()
	return cfg.Preferences, err
}

// SavePreferences writes preferences to disk.
func SavePreferences(p Preferences) error {
	cfg, _ := loadConfig()
	cfg.Preferences = p
	return saveConfig(cfg)
}

// LoadConnections reads all connection profiles from disk.
func LoadConnections() ([]*models.ConnectionProfile, error) {
	cfg, err := loadConfig()
	return cfg.Connections, err
}

// SaveConnections writes the full list of connection profiles to disk.
func SaveConnections(profiles []*models.ConnectionProfile) error {
	cfg, _ := loadConfig()
	cfg.Connections = profiles
	return saveConfig(cfg)
}

// DeleteConnectionByID removes the pool profile with the given ID.
func DeleteConnectionByID(id string) error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	filtered := cfg.Connections[:0]
	for _, p := range cfg.Connections {
		if p.ID != id {
			filtered = append(filtered, p)
		}
	}
	// Also delete password from keyring
	if err := DeletePassword(id); err != nil {
		return fmt.Errorf("keyring delete: %w", err)
	}
	if err := DeleteSSHSecrets(id); err != nil {
		return fmt.Errorf("keyring delete: %w", err)
	}
	cfg.Connections = filtered
	return saveConfig(cfg)
}
