// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestOldSettingsLoseRowAccessAndGetANoticeOnce(t *testing.T) {
	path := filepath.Join(t.TempDir(), "ai-settings.json")
	old := `{"projects":{"p1":{"enabled":true,"allowReadData":true,"classificationRules":[{"table":"users","column":"email","sensitive":false}]},"p2":{"enabled":false,"allowReadData":true}}}`
	if err := os.WriteFile(path, []byte(old), 0o600); err != nil {
		t.Fatal(err)
	}
	file, err := loadAISettings(path)
	if err != nil {
		t.Fatal(err)
	}
	p1 := file.Projects["p1"]
	if p1.AllowReadData || p1.DataMode || !p1.DataPolicyNotice || p1.Version != aiSettingsVersion {
		t.Fatalf("p1 %+v", p1)
	}
	if p2 := file.Projects["p2"]; p2.DataPolicyNotice || p2.AllowReadData {
		t.Fatalf("a project with the assistant off got a notice: %+v", p2)
	}
	if err := saveAISettings(path, file); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(path)
	if strings.Contains(string(raw), "classificationRules") {
		t.Fatalf("the old rules were kept: %s", raw)
	}

	// A save from the UI clears the notice and is not migrated again.
	p1.DataPolicyNotice = false
	p1.AllowReadData = true
	p1.Version = 0
	file.Projects["p1"] = p1
	if err := saveAISettings(path, file); err != nil {
		t.Fatal(err)
	}
	again, err := loadAISettings(path)
	if err != nil {
		t.Fatal(err)
	}
	if got := again.Projects["p1"]; !got.AllowReadData || got.DataPolicyNotice {
		t.Fatalf("a current save was migrated again: %+v", got)
	}
}
