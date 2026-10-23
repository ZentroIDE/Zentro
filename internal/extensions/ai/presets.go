// SPDX-License-Identifier: GPL-3.0-only

package ai

import "strings"

// ProviderPreset is a model host Zentro names and fills in. The API key is
// not part of the preset.
type ProviderPreset struct {
	ID        string
	Label     string
	BaseURL   string
	ModelsURL string
	// ModelHint is the start of the name of the model to prefer once the real
	// list is known. It is not a model name: models are renamed and retired, so
	// the list the host returns is the only thing that says what exists.
	ModelHint string
	// Adapter names the API this host speaks. See AdapterByID.
	Adapter string
}

// ProviderPresets is Codex and DeepSeek. Other hosts are not offered.
func ProviderPresets() []ProviderPreset {
	return []ProviderPreset{
		{
			ID:        "codex",
			Label:     "Codex",
			BaseURL:   "https://api.openai.com/v1/responses",
			ModelsURL: "https://api.openai.com/v1/models",
			ModelHint: "gpt-5",
			Adapter:   AdapterResponses,
		},
		{
			ID:        "deepseek",
			Label:     "DeepSeek",
			BaseURL:   "https://api.deepseek.com/v1",
			ModelsURL: "https://api.deepseek.com/v1/models",
			ModelHint: "deepseek-chat",
			Adapter:   AdapterChat,
		},
	}
}

// MatchPreset returns the named provider for a model address, if any.
func MatchPreset(baseURL string) (ProviderPreset, bool) {
	return MatchPresetByHost(EndpointHost(baseURL))
}

// MatchPresetByHost returns the named provider for a hostname, if any.
func MatchPresetByHost(host string) (ProviderPreset, bool) {
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "" {
		return ProviderPreset{}, false
	}
	for _, preset := range ProviderPresets() {
		if strings.ToLower(EndpointHost(preset.BaseURL)) == host {
			return preset, true
		}
	}
	return ProviderPreset{}, false
}
