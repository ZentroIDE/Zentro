// SPDX-License-Identifier: GPL-3.0-only

package utils

import (
	"encoding/json"
	"testing"
)

func TestErrorLensUnsetIsOmittedFromJSON(t *testing.T) {
	data, err := json.Marshal(Preferences{})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, present := raw["error_lens"]; present {
		t.Fatalf("an unset ErrorLens must be omitted so the frontend can default it to on, got %v", raw["error_lens"])
	}
}

func TestErrorLensOlderConfigLoadsAsUnset(t *testing.T) {
	var prefs Preferences
	if err := json.Unmarshal([]byte(`{"theme":"dark","minimap":true}`), &prefs); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if prefs.ErrorLens != nil {
		t.Fatalf("a config without error_lens must load as unset, got %v", *prefs.ErrorLens)
	}
}

func TestErrorLensChoiceSurvivesSaveAndLoad(t *testing.T) {
	for _, choice := range []bool{true, false} {
		seedConfigEnv(t)
		prefs := defaultConfig().Preferences
		prefs.ErrorLens = &choice

		if err := SavePreferences(prefs); err != nil {
			t.Fatalf("save (%v): %v", choice, err)
		}
		loaded, err := LoadPreferences()
		if err != nil {
			t.Fatalf("load (%v): %v", choice, err)
		}
		if loaded.ErrorLens == nil || *loaded.ErrorLens != choice {
			t.Fatalf("ErrorLens = %v after save/load, want %v", loaded.ErrorLens, choice)
		}
	}
}
