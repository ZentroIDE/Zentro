// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"zentro/internal/extensions/ai"
	"zentro/internal/models"
)

func TestAssistantPreviewAndSend(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte("{\"choices\":[{\"message\":{\"content\":\"```sql\\nselect id from orders where status = :status\\n```\"}}]}"))
	}))
	defer server.Close()

	svc := newTestAIService(t, server.URL)
	preview, err := svc.Preview(context.Background(), AIPreviewRequest{
		Message: "email me at person@example.com",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !preview.Held || preview.HoldReason != ai.HoldSensitive || preview.SendToken != "" {
		t.Fatalf("expected a hold, got %+v", preview)
	}
	if strings.Contains(preview.Body, "person@example.com") == false {
		t.Fatal("preview hid the text the user typed")
	}

	preview, err = svc.Preview(context.Background(), AIPreviewRequest{
		Message:              "list orders",
		AcknowledgeSensitive: false,
	})
	if err != nil {
		t.Fatal(err)
	}
	if preview.Held || preview.SendToken == "" {
		t.Fatalf("clean message should be sendable: %+v", preview)
	}
	if strings.Contains(preview.Body, "postgres://") || strings.Contains(preview.Body, "secret") {
		t.Fatalf("catalog secret leaked into the body: %s", preview.Body)
	}

	sent, err := svc.Send(context.Background(), AISendRequest{
		Message:   "list orders",
		SendToken: preview.SendToken,
	})
	if err != nil {
		t.Fatal(err)
	}
	if sent.SQL == "" || sent.Risk != "read" {
		t.Fatalf("result %+v", sent)
	}

	if _, err := svc.Send(context.Background(), AISendRequest{Message: "list orders", SendToken: "nope"}); err == nil {
		t.Fatal("a stale token was accepted")
	}
}

func newTestAIService(t *testing.T, baseURL string) *AIService {
	t.Helper()
	svc := NewAIService(
		nil,
		nil,
		func() *models.ConnectionProfile { return &models.ConnectionProfile{ID: "conn"} },
		func() *models.Project { return &models.Project{ID: "proj"} },
		func() string { return "public" },
		func() string { return "dev" },
		func() bool { return true },
		func() bool { return false },
		nil,
		func() {},
	)
	svc.settingsPath = filepath.Join(t.TempDir(), "ai-settings.json")
	if _, err := svc.SetSettings(ProjectAISettings{
		Enabled: true,
		BaseURL: baseURL + "/v1",
		Model:   "local",
	}); err != nil {
		t.Fatal(err)
	}
	svc.catalogFn = func(context.Context, string, bool, bool) (ai.Catalog, error) {
		return ai.Catalog{
			Schema: "public",
			Tables: []ai.Table{{
				Name:    "orders",
				Columns: []ai.Column{{Name: "id", DataType: "int", PrimaryKey: true}},
			}},
			Routines: []ai.Object{{
				Kind:    "routine",
				Name:    "sync",
				Missing: true,
			}},
		}, nil
	}
	return svc
}

func TestAssistantKeepsKnownModelsAcrossSettingsSaves(t *testing.T) {
	svc := newTestAIService(t, "http://127.0.0.1:1")
	if err := svc.rememberModels("proj", "api.deepseek.com", []string{"deepseek-chat", "deepseek-reasoner"}); err != nil {
		t.Fatal(err)
	}

	view, err := svc.SetSettings(ProjectAISettings{
		Enabled: true,
		BaseURL: "https://api.deepseek.com/v1",
		Model:   "deepseek-chat",
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, provider := range view.Providers {
		if provider.ID == "deepseek" && len(provider.Models) != 2 {
			t.Fatalf("SetSettings dropped the cached models: %+v", provider)
		}
	}
}

func TestForgetProviderModelsResetsActiveModel(t *testing.T) {
	settings := ProjectAISettings{
		BaseURL:     "https://api.deepseek.com/v1",
		Model:       "deepseek-reasoner",
		KnownModels: map[string][]string{"api.deepseek.com": {"deepseek-reasoner"}, "api.openai.com": {"gpt-5-codex"}},
	}
	next := forgetProviderModels(settings, "api.deepseek.com")
	if next.Model != "" {
		t.Fatalf("a model was kept with no list to check it against: %q", next.Model)
	}
	if _, ok := next.KnownModels["api.deepseek.com"]; ok {
		t.Fatal("deepseek list was kept after clear")
	}
	if len(next.KnownModels["api.openai.com"]) != 1 {
		t.Fatal("another provider's list was dropped")
	}
}

func TestAssistantViewNeverReturnsNullModels(t *testing.T) {
	svc := newTestAIService(t, "http://127.0.0.1:1")
	view, err := svc.GetSettings()
	if err != nil {
		t.Fatal(err)
	}
	for _, provider := range view.Providers {
		if provider.Models == nil {
			t.Fatalf("%s models must be an empty list, not null", provider.ID)
		}
	}
}
