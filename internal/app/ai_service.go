// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"strings"
	"sync"

	dbpkg "zentro/internal/db"
	"zentro/internal/extensions/ai"
	"zentro/internal/extensions/license"
	"zentro/internal/models"
)

// AISettingsView is the assistant state the UI may show. It never includes
// the API key.
type AISettingsView struct {
	Enabled                  bool               `json:"enabled"`
	AllowCloud               bool               `json:"allowCloud"`
	BaseURL                  string             `json:"baseURL"`
	Model                    string             `json:"model"`
	AllowedHosts             []string           `json:"allowedHosts"`
	DisabledConnectionIDs    []string           `json:"disabledConnectionIDs"`
	IncludeBodies            bool               `json:"includeBodies"`
	IncludeConnectionDetails bool               `json:"includeConnectionDetails"`
	AllowReadData            bool               `json:"allowReadData"`
	DataMode                 bool               `json:"dataMode"`
	AutoApprove              bool               `json:"autoApprove"`
	DataPolicyNotice         bool               `json:"dataPolicyNotice"`
	AllowChanges             bool               `json:"allowChanges"`
	AllowAudit               bool               `json:"allowAudit"`
	AllowProduction          bool               `json:"allowProduction"`
	ConnectionDisabled       bool               `json:"connectionDisabled"`
	KeyHint                  string             `json:"keyHint"`
	HasKey                   bool               `json:"hasKey"`
	ACPAvailable             bool               `json:"acpAvailable"`
	MCPAvailable             bool               `json:"mcpAvailable"`
	Airgap                   bool               `json:"airgap"`
	Production               bool               `json:"production"`
	Providers                []AIProviderStatus `json:"providers"`
}

// AIModelCatalog is the model ids returned after a provider key test.
type AIModelCatalog struct {
	Host   string   `json:"host"`
	Models []string `json:"models"`
}

// AIProviderStatus is one named host Zentro fills in. The key is never included.
type AIProviderStatus struct {
	ID      string   `json:"id"`
	Label   string   `json:"label"`
	Host    string   `json:"host"`
	BaseURL string   `json:"baseURL"`
	Model   string   `json:"model"`
	HasKey  bool     `json:"hasKey"`
	KeyHint string   `json:"keyHint"`
	Active  bool     `json:"active"`
	Models  []string `json:"models"`
}

// AIPreviewRequest asks for the data a send would use. GrantSession keeps the
// approval for the session until the metadata or target changes.
type AIPreviewRequest struct {
	Message              string   `json:"message"`
	IncludeBodies        bool     `json:"includeBodies"`
	AcceptHost           bool     `json:"acceptHost"`
	AcknowledgeSensitive bool     `json:"acknowledgeSensitive"`
	Refresh              bool     `json:"refresh"`
	SessionID            string   `json:"sessionId"`
	Mentions             []string `json:"mentions"`
	GrantSession         bool     `json:"grantSession"`
}

// AIPreview is the data review. SendToken is empty while the send is held.
// Data is the schema block alone; Body is the full request, shown on demand.
type AIPreview struct {
	Host            string     `json:"host"`
	Model           string     `json:"model"`
	Body            string     `json:"body"`
	Data            string     `json:"data"`
	EstimatedTokens int        `json:"estimatedTokens"`
	HistoryTurns    int        `json:"historyTurns"`
	SendToken       string     `json:"sendToken"`
	Held            bool       `json:"held"`
	HoldReason      string     `json:"holdReason"`
	Matches         []ai.Match `json:"matches"`
	Loopback        bool       `json:"loopback"`
	Granted         bool       `json:"granted"`
}

// AISendRequest asks one question in a session. RequestID, when set, streams
// the reply as ai:chat-delta events. SendToken is optional when the session
// holds a grant.
type AISendRequest struct {
	Message              string   `json:"message"`
	IncludeBodies        bool     `json:"includeBodies"`
	AcknowledgeSensitive bool     `json:"acknowledgeSensitive"`
	SendToken            string   `json:"sendToken"`
	SessionID            string   `json:"sessionId"`
	RequestID            string   `json:"requestId"`
	Mentions             []string `json:"mentions"`
}

// AISendResult is the model reply and any SQL the user can open. The reply
// is not written to the log. Stopped is set when the user cancelled a stream.
type AISendResult struct {
	Reply           string          `json:"reply"`
	SQL             string          `json:"sql"`
	Risk            string          `json:"risk"`
	Held            bool            `json:"held"`
	HoldReason      string          `json:"holdReason"`
	Matches         []ai.Match      `json:"matches"`
	Suggestions     []string        `json:"suggestions"`
	Usage           *AISessionUsage `json:"usage"`
	EstimatedTokens int             `json:"estimatedTokens"`
	Stopped         bool            `json:"stopped"`
	// Rounds is every request the reply sent, for the "Sent to" view.
	Rounds []AISentRound `json:"rounds"`
	// DurationMs is how long the reply took, from the first request to the
	// last word, including any wait for the user to share rows.
	DurationMs int64 `json:"durationMs"`
}

// AIService prepares metadata-only chat requests. ACP is not available here.
type AIService struct {
	logger      *slog.Logger
	db          func() *sql.DB
	profile     func() *models.ConnectionProfile
	project     func() *models.Project
	schemaName  func() string
	environment func() string
	allowed     func() bool
	airgap      func() bool
	// canUse checks one license feature. It is set after construction, like
	// emitter; without it a tool that needs a feature is not offered.
	canUse func(license.FeatureID) bool
	// source is how the context tools reach the app. Set after construction.
	source *aiContextSource
	// viewMode reports the app's read-only toggle (Preferences.ViewMode). Set
	// after construction, like canUse and source.
	viewMode func() bool
	// envSemaphore bounds how many resolveEnv connections (env_resolver.go)
	// are open at once. Buffered to envConcurrencyLimit; a slot is a token in
	// the channel, not tied to which environment it is for.
	envSemaphore chan struct{}
	// loadConnectionsFn replaces utils.LoadConnections in a test, the same
	// way catalogFn replaces loadCatalog. nil means the real one.
	loadConnectionsFn func() ([]*models.ConnectionProfile, error)
	scripts           func(projectID, connectionName string) ([]assistantScript, error)
	recordUse         func()
	settingsPath      string
	catalogFn         func(ctx context.Context, schema string, includeBodies, refresh bool) (ai.Catalog, error)
	emitter           EventEmitter
	sessionsDir       string

	grantMu sync.Mutex
	grants  map[string]aiDataGrant

	cancelMu sync.Mutex
	cancels  map[string]context.CancelFunc
	// approvals holds the reply waiting for the user to share rows, by request
	// ID (ai_chat_approval.go).
	approvalMu sync.Mutex
	approvals  map[string]chan bool

	// mcp is the server external agents call. mcpTokenFn replaces the keyring
	// in tests.
	mcp        aiMCPServer
	mcpTokenFn func() (string, error)

	cacheMu  sync.Mutex
	cacheKey string
	cache    ai.Catalog
}

func NewAIService(
	logger *slog.Logger,
	db func() *sql.DB,
	profile func() *models.ConnectionProfile,
	project func() *models.Project,
	schemaName func() string,
	environment func() string,
	allowed func() bool,
	airgap func() bool,
	scripts func(projectID, connectionName string) ([]assistantScript, error),
	recordUse func(),
) *AIService {
	return &AIService{
		logger:       logger,
		db:           db,
		profile:      profile,
		project:      project,
		schemaName:   schemaName,
		environment:  environment,
		allowed:      allowed,
		airgap:       airgap,
		scripts:      scripts,
		recordUse:    recordUse,
		envSemaphore: make(chan struct{}, envConcurrencyLimit),
	}
}

func (s *AIService) GetSettings() (AISettingsView, error) {
	settings, projectID, err := s.readSettings()
	if err != nil {
		return AISettingsView{}, err
	}
	return s.view(settings, projectID), nil
}

func (s *AIService) SetSettings(next ProjectAISettings) (AISettingsView, error) {
	if err := s.requireAllowed(); err != nil {
		return AISettingsView{}, err
	}
	projectID, err := s.projectID()
	if err != nil {
		return AISettingsView{}, err
	}
	path, err := s.path()
	if err != nil {
		return AISettingsView{}, err
	}
	file, err := loadAISettings(path)
	if err != nil {
		return AISettingsView{}, err
	}
	next.BaseURL = strings.TrimSpace(next.BaseURL)
	next.Model = strings.TrimSpace(next.Model)
	if preset, ok := ai.MatchPreset(next.BaseURL); ok {
		next.AllowCloud = true
		if host := ai.EndpointHost(preset.BaseURL); host != "" && !ai.HostAllowed(host, next.AllowedHosts) {
			next.AllowedHosts = append(append([]string{}, next.AllowedHosts...), host)
		}
	}
	// Model ids are cached by ListModels. The UI cannot write them, so keep the stored list.
	next.KnownModels = file.Projects[projectID].KnownModels
	file.Projects[projectID] = next
	if err := saveAISettings(path, file); err != nil {
		return AISettingsView{}, err
	}
	return s.view(next, projectID), nil
}

func (s *AIService) SaveKey(secret, host string) (AISettingsView, error) {
	if err := s.requireAllowed(); err != nil {
		return AISettingsView{}, err
	}
	settings, projectID, err := s.readSettings()
	if err != nil {
		return AISettingsView{}, err
	}
	if strings.TrimSpace(host) == "" {
		host = ai.EndpointHost(settings.BaseURL)
	}
	if err := ai.SaveProviderKey(projectID, host, secret); err != nil {
		return AISettingsView{}, err
	}
	return s.GetSettings()
}

func (s *AIService) ClearKey(host string) (AISettingsView, error) {
	if err := s.requireAllowed(); err != nil {
		return AISettingsView{}, err
	}
	settings, projectID, err := s.readSettings()
	if err != nil {
		return AISettingsView{}, err
	}
	if strings.TrimSpace(host) == "" {
		host = ai.EndpointHost(settings.BaseURL)
	}
	if err := ai.DeleteProviderKey(projectID, host); err != nil {
		return AISettingsView{}, err
	}
	settings = forgetProviderModels(settings, host)
	if err := s.writeSettings(projectID, settings); err != nil {
		return AISettingsView{}, err
	}
	return s.GetSettings()
}

func (s *AIService) ListModels(ctx context.Context, host string) (AIModelCatalog, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := s.requireAllowed(); err != nil {
		return AIModelCatalog{}, err
	}
	preset, ok := ai.MatchPresetByHost(host)
	if !ok {
		return AIModelCatalog{}, fmt.Errorf("choose Codex or DeepSeek before testing")
	}
	if s.airgap != nil && s.airgap() {
		return AIModelCatalog{}, fmt.Errorf("this license keeps the assistant on this computer")
	}
	if environmentIsProduction(s.envKey()) {
		return AIModelCatalog{}, fmt.Errorf("production connections can only use a model on this computer")
	}
	projectID, err := s.projectID()
	if err != nil {
		return AIModelCatalog{}, err
	}
	key, err := ai.LoadProviderKey(projectID, ai.EndpointHost(preset.BaseURL))
	if err != nil {
		return AIModelCatalog{}, err
	}
	listed, err := ai.ListModels(ctx, preset.ModelsURL, key)
	if err != nil {
		return AIModelCatalog{}, err
	}
	// A host lists everything it serves. Keep the models this API can chat with.
	ids := listed
	if adapter, found := ai.AdapterByID(preset.Adapter); found {
		ids = adapter.UsableModels(listed)
	}
	if len(ids) == 0 {
		return AIModelCatalog{}, fmt.Errorf("this key has no chat models")
	}
	host = ai.EndpointHost(preset.BaseURL)
	if err := s.rememberModels(projectID, host, ids); err != nil {
		return AIModelCatalog{}, err
	}
	if err := s.chooseModel(projectID, host, ids, preset.ModelHint); err != nil {
		return AIModelCatalog{}, err
	}
	return AIModelCatalog{Host: host, Models: ids}, nil
}

// chooseModel sets the model of the active provider from the list the host
// returned. The model in use stays when it is still listed, so a model the host
// retired is replaced here and not at the next send. Nothing is changed when
// the provider is not the active one.
func (s *AIService) chooseModel(projectID, host string, ids []string, hint string) error {
	file, path, err := s.loadFile()
	if err != nil {
		return err
	}
	settings := file.Projects[projectID]
	if !strings.EqualFold(ai.EndpointHost(settings.BaseURL), host) {
		return nil
	}
	picked := ai.PickModel(ids, settings.Model, hint)
	if picked == settings.Model {
		return nil
	}
	settings.Model = picked
	file.Projects[projectID] = settings
	return saveAISettings(path, file)
}

func (s *AIService) requireAllowed() error {
	if s.allowed != nil && !s.allowed() {
		return fmt.Errorf("the assistant is turned off for this installation")
	}
	return nil
}

func (s *AIService) readSettings() (ProjectAISettings, string, error) {
	projectID, err := s.projectID()
	if err != nil {
		return ProjectAISettings{}, "", err
	}
	path, err := s.path()
	if err != nil {
		return ProjectAISettings{}, "", err
	}
	file, err := loadAISettings(path)
	if err != nil {
		return ProjectAISettings{}, "", err
	}
	return file.Projects[projectID], projectID, nil
}

// rememberModels caches the ids a host returned so the list survives a restart.
func (s *AIService) rememberModels(projectID, host string, ids []string) error {
	file, path, err := s.loadFile()
	if err != nil {
		return err
	}
	settings := file.Projects[projectID]
	settings.KnownModels = withKnownModels(settings.KnownModels, host, ids)
	file.Projects[projectID] = settings
	return saveAISettings(path, file)
}

func (s *AIService) loadFile() (aiSettingsFile, string, error) {
	path, err := s.path()
	if err != nil {
		return aiSettingsFile{}, "", err
	}
	file, err := loadAISettings(path)
	return file, path, err
}

func withKnownModels(known map[string][]string, host string, ids []string) map[string][]string {
	out := make(map[string][]string, len(known)+1)
	for key, value := range known {
		out[key] = value
	}
	out[host] = append([]string{}, ids...)
	return out
}

func withoutKnownModels(known map[string][]string, host string) map[string][]string {
	out := make(map[string][]string, len(known))
	for key, value := range known {
		if key != host {
			out[key] = value
		}
	}
	return out
}

// forgetProviderModels drops the cached list for host. When host is the
// active provider, its model is cleared too: nothing is assumed without a list.
func forgetProviderModels(settings ProjectAISettings, host string) ProjectAISettings {
	if _, ok := settings.KnownModels[host]; ok {
		settings.KnownModels = withoutKnownModels(settings.KnownModels, host)
	}
	if strings.EqualFold(ai.EndpointHost(settings.BaseURL), host) {
		settings.Model = ""
	}
	return settings
}

func (s *AIService) writeSettings(projectID string, settings ProjectAISettings) error {
	path, err := s.path()
	if err != nil {
		return err
	}
	file, err := loadAISettings(path)
	if err != nil {
		return err
	}
	file.Projects[projectID] = settings
	return saveAISettings(path, file)
}

func (s *AIService) path() (string, error) {
	if s.settingsPath != "" {
		return s.settingsPath, nil
	}
	return defaultAISettingsPath()
}

func (s *AIService) projectID() (string, error) {
	if s.project == nil {
		return "", fmt.Errorf("open a project before using the assistant")
	}
	project := s.project()
	if project == nil || strings.TrimSpace(project.ID) == "" {
		return "", fmt.Errorf("open a project before using the assistant")
	}
	return project.ID, nil
}

func (s *AIService) connectionDisabled(settings ProjectAISettings) bool {
	profile := s.currentProfile()
	if profile == nil {
		return false
	}
	for _, id := range settings.DisabledConnectionIDs {
		if id == profile.ID {
			return true
		}
	}
	return false
}

func (s *AIService) view(settings ProjectAISettings, projectID string) AISettingsView {
	secret, _ := ai.LoadProviderKey(projectID, ai.EndpointHost(settings.BaseURL))
	activeHost := strings.ToLower(ai.EndpointHost(settings.BaseURL))
	providers := make([]AIProviderStatus, 0, len(ai.ProviderPresets()))
	for _, preset := range ai.ProviderPresets() {
		host := ai.EndpointHost(preset.BaseURL)
		key, _ := ai.LoadProviderKey(projectID, host)
		active := strings.ToLower(host) == activeHost && host != ""
		// No model is assumed. The one in use is the active provider's own. For
		// the others it is the best pick from the list that host last returned.
		model := ai.PickModel(settings.KnownModels[host], "", preset.ModelHint)
		if active {
			model = settings.Model
		}
		providers = append(providers, AIProviderStatus{
			ID:      preset.ID,
			Label:   preset.Label,
			Host:    host,
			BaseURL: preset.BaseURL,
			Model:   model,
			HasKey:  key != "",
			KeyHint: ai.KeyHint(key),
			Active:  active,
			Models:  append([]string{}, settings.KnownModels[host]...),
		})
	}
	return AISettingsView{
		Enabled:                  settings.Enabled,
		AllowCloud:               settings.AllowCloud,
		BaseURL:                  settings.BaseURL,
		Model:                    settings.Model,
		AllowedHosts:             settings.AllowedHosts,
		DisabledConnectionIDs:    settings.DisabledConnectionIDs,
		IncludeBodies:            settings.IncludeBodies,
		IncludeConnectionDetails: settings.IncludeConnectionDetails,
		AllowReadData:            settings.AllowReadData,
		DataMode:                 settings.DataMode,
		AutoApprove:              settings.AutoApprove,
		DataPolicyNotice:         settings.DataPolicyNotice,
		AllowChanges:             settings.AllowChanges,
		AllowAudit:               settings.AllowAudit,
		AllowProduction:          settings.AllowProduction,
		ConnectionDisabled:       s.connectionDisabled(settings),
		KeyHint:                  ai.KeyHint(secret),
		HasKey:                   secret != "",
		ACPAvailable:             false,
		MCPAvailable:             false,
		Airgap:                   s.airgap != nil && s.airgap(),
		Production:               environmentIsProduction(s.envKey()),
		Providers:                providers,
	}
}

func (s *AIService) model() string {
	settings, _, err := s.readSettings()
	if err != nil {
		return ""
	}
	return settings.Model
}

func (s *AIService) envKey() string {
	if s.environment == nil {
		return ""
	}
	return s.environment()
}

func (s *AIService) currentProfile() *models.ConnectionProfile {
	if s.profile == nil {
		return nil
	}
	return s.profile()
}

func sqlRiskLabel(query string) string {
	if strings.TrimSpace(query) == "" {
		return ""
	}
	risk := dbpkg.AnalyzeSQLRisk(query)
	switch {
	case risk.HasDestructive:
		return "destructive"
	case risk.HasWrite:
		return "write"
	default:
		return "read"
	}
}
