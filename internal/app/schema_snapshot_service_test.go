// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"zentro/internal/models"
)

func TestSourceControlAutomationService_TrackSchemaSnapshot_CommitsSchemaArtifacts(t *testing.T) {
	sc := NewSourceControlService()
	svc := NewSourceControlAutomationService(sc, nil)
	project := &models.Project{
		ID:                  "project-schema",
		StoragePath:         t.TempDir(),
		AutoSchemaSnapshots: true,
	}
	if err := sc.InitRepo(project.StoragePath); err != nil {
		t.Fatalf("init repo failed: %v", err)
	}

	result, err := svc.TrackSchemaSnapshot(project, "public", map[string]string{
		"tables/users.sql":  "create table public.users(id bigint primary key);\n",
		"routines/sync.sql": "create function public.sync() returns void language sql as $$ select 1 $$;\n",
		"manifest.json":     "{\n  \"schema\": \"public\"\n}\n",
	}, "zentro.sc.auto: snapshot schema public")
	if err != nil {
		t.Fatalf("track schema snapshot failed: %v", err)
	}
	if result.Hash == "" {
		t.Fatalf("expected snapshot commit hash")
	}
	if result.NoChanges {
		t.Fatalf("expected schema snapshot to create a commit")
	}

	pending, err := sc.GetPendingChanges(project.StoragePath)
	if err != nil {
		t.Fatalf("get pending failed: %v", err)
	}
	if len(pending) != 0 {
		t.Fatalf("expected clean repo after schema snapshot commit, got %v", pending)
	}

	schemaFile := filepath.Join(project.StoragePath, "artifacts", "source-control", "schema", "public", "tables", "users.sql")
	data, err := os.ReadFile(schemaFile)
	if err != nil {
		t.Fatalf("read schema file failed: %v", err)
	}
	if !strings.Contains(string(data), "create table public.users") {
		t.Fatalf("unexpected schema snapshot contents: %s", string(data))
	}

	items, err := sc.ListTimeline(project.StoragePath, 20, "zentro.sc.auto")
	if err != nil {
		t.Fatalf("list timeline failed: %v", err)
	}
	if len(items) == 0 {
		t.Fatalf("expected zentro.sc.auto schema snapshot commit in timeline")
	}
}
