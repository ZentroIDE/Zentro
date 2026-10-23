// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"zentro/internal/models"
)

func TestBuildConnectionBundle_FiltersAndStripsSecrets(t *testing.T) {
	pool := []*models.ConnectionProfile{
		{Name: "a", Driver: "postgres", Host: "ha", Password: "pa", SavePassword: true, EncryptPassword: true},
		{Name: "b", Driver: "mysql", Host: "hb", Password: "pb", SavePassword: true},
		{Name: "c", Driver: "sqlite", Host: "hc"},
	}

	all := buildConnectionBundle(pool, nil)
	if all.Version != "v1" {
		t.Fatalf("version = %q, want v1", all.Version)
	}
	if len(all.Connections) != 3 {
		t.Fatalf("empty names should export all, got %d", len(all.Connections))
	}
	for _, c := range all.Connections {
		if c.Password != "" || c.SavePassword || c.EncryptPassword {
			t.Fatalf("secrets not stripped: %+v", c)
		}
	}

	subset := buildConnectionBundle(pool, []string{"a", "c", "missing"})
	if len(subset.Connections) != 2 {
		t.Fatalf("subset len = %d, want 2", len(subset.Connections))
	}
	if subset.Connections[0].Name != "a" || subset.Connections[1].Name != "c" {
		t.Fatalf("unexpected subset order/content: %+v", subset.Connections)
	}
}

func TestParseConnectionBundleFile_BundleAndLegacyPackage(t *testing.T) {
	dir := t.TempDir()

	bundlePath := filepath.Join(dir, "bundle.json")
	bundle := ConnectionBundle{
		Version: "v1",
		Connections: []models.ConnectionProfile{
			{Name: "one", Driver: "postgres", Password: "leak", SavePassword: true},
			{Name: "", Driver: "mysql"}, // skipped: no name
		},
	}
	writeJSON(t, bundlePath, bundle)

	got, err := parseConnectionBundleFile(bundlePath)
	if err != nil {
		t.Fatalf("parse bundle: %v", err)
	}
	if len(got) != 1 || got[0].Name != "one" || got[0].Password != "" || got[0].SavePassword {
		t.Fatalf("unexpected bundle parse result: %+v", got)
	}

	legacyPath := filepath.Join(dir, "legacy.connection.json")
	writeJSON(t, legacyPath, legacyConnectionPackage{
		Version:    "v1",
		Connection: models.ConnectionProfile{Name: "solo", Driver: "postgres", Password: "leak"},
	})

	gotLegacy, err := parseConnectionBundleFile(legacyPath)
	if err != nil {
		t.Fatalf("parse legacy: %v", err)
	}
	if len(gotLegacy) != 1 || gotLegacy[0].Name != "solo" || gotLegacy[0].Password != "" {
		t.Fatalf("unexpected legacy parse result: %+v", gotLegacy)
	}
}

func writeJSON(t *testing.T, path string, v any) {
	t.Helper()
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}
