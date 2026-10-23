// SPDX-License-Identifier: GPL-3.0-only

package utils

import (
	"encoding/json"
	"testing"
)

func TestSQLFormatOlderConfigLoadsAsDefaults(t *testing.T) {
	var prefs Preferences
	if err := json.Unmarshal([]byte(`{"theme":"dark","minimap":true}`), &prefs); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if prefs.SQLFormat != (SQLFormatPrefs{}) {
		t.Fatalf("a config without sql_format must load as zero values (= defaults), got %+v", prefs.SQLFormat)
	}
}

func TestSQLFormatChoicesSurviveSaveAndLoad(t *testing.T) {
	seedConfigEnv(t)
	want := SQLFormatPrefs{
		KeywordCase:   "lower",
		IndentSize:    4,
		UseTabs:       true,
		CommaPosition: "leading",
		AndOrPosition: "trailing",
	}
	prefs := defaultConfig().Preferences
	prefs.SQLFormat = want

	if err := SavePreferences(prefs); err != nil {
		t.Fatalf("save: %v", err)
	}
	loaded, err := LoadPreferences()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if loaded.SQLFormat != want {
		t.Fatalf("SQLFormat = %+v after save/load, want %+v", loaded.SQLFormat, want)
	}
}
