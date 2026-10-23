// SPDX-License-Identifier: GPL-3.0-only

package utils

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestSQLEditorStyleOlderConfigLoadsEmpty(t *testing.T) {
	var prefs Preferences
	if err := json.Unmarshal([]byte(`{"theme":"dark"}`), &prefs); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(prefs.SQLEditorStyle.Light) != 0 || len(prefs.SQLEditorStyle.Dark) != 0 || prefs.SQLEditorStyle.SchemaHighlight {
		t.Fatalf("a config without sql_editor_style must load as no overrides, got %+v", prefs.SQLEditorStyle)
	}
}

func TestSQLEditorStyleSurvivesSaveAndLoad(t *testing.T) {
	seedConfigEnv(t)
	want := SQLEditorStyle{
		Light:           map[string]SQLTokenStyle{"keyword": {Color: "#0000ff", Weight: "semibold"}},
		Dark:            map[string]SQLTokenStyle{"string": {Color: "#ce9178"}, "comment": {Italic: true}},
		SchemaHighlight: true,
	}
	prefs := defaultConfig().Preferences
	prefs.SQLEditorStyle = want

	if err := SavePreferences(prefs); err != nil {
		t.Fatalf("save: %v", err)
	}
	loaded, err := LoadPreferences()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if !reflect.DeepEqual(loaded.SQLEditorStyle, want) {
		t.Fatalf("SQLEditorStyle = %+v after save/load, want %+v", loaded.SQLEditorStyle, want)
	}
}
