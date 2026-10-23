// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"testing"

	"zentro/internal/models"
)

// templateServiceTestSetup redirects os.UserConfigDir to a tempdir so each test
// gets its own templates.json file under that root.
func templateServiceTestSetup(t *testing.T) {
	t.Helper()
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	t.Setenv("APPDATA", t.TempDir())
	t.Setenv("HOME", t.TempDir())
}

func TestTemplateService_LoadTemplates_EmptyWhenNoFile(t *testing.T) {
	templateServiceTestSetup(t)

	svc := NewTemplateService()
	templates, err := svc.LoadTemplates()
	if err != nil {
		t.Fatalf("LoadTemplates: %v", err)
	}
	if len(templates) != 0 {
		t.Errorf("expected empty templates, got %d", len(templates))
	}
}

func TestTemplateService_SaveTemplate_AssignsIDAndPersists(t *testing.T) {
	templateServiceTestSetup(t)

	svc := NewTemplateService()
	tpl := models.Template{Name: "select-all", Trigger: "sa", Content: "SELECT * FROM ?"}
	if err := svc.SaveTemplate(tpl); err != nil {
		t.Fatalf("SaveTemplate: %v", err)
	}

	// Fresh service to confirm persistence across instances.
	reloaded := NewTemplateService()
	got, err := reloaded.LoadTemplates()
	if err != nil {
		t.Fatalf("reload LoadTemplates: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 template, got %d", len(got))
	}
	if got[0].ID == "" {
		t.Error("expected service to assign a non-empty ID on save")
	}
	if got[0].Name != "select-all" {
		t.Errorf("unexpected name: %q", got[0].Name)
	}
}

func TestTemplateService_SaveTemplate_UpdatesExistingByID(t *testing.T) {
	templateServiceTestSetup(t)

	svc := NewTemplateService()
	if err := svc.SaveTemplate(models.Template{ID: "fixed-id", Name: "v1", Content: "SELECT 1"}); err != nil {
		t.Fatalf("first save: %v", err)
	}
	if err := svc.SaveTemplate(models.Template{ID: "fixed-id", Name: "v2", Content: "SELECT 2"}); err != nil {
		t.Fatalf("update save: %v", err)
	}

	got, _ := svc.LoadTemplates()
	if len(got) != 1 {
		t.Fatalf("expected exactly 1 template after update, got %d", len(got))
	}
	if got[0].Name != "v2" || got[0].Content != "SELECT 2" {
		t.Errorf("expected updated v2 content, got %+v", got[0])
	}
}

func TestTemplateService_SaveTemplate_AppendsWhenIDNotFound(t *testing.T) {
	templateServiceTestSetup(t)

	svc := NewTemplateService()
	if err := svc.SaveTemplate(models.Template{ID: "id-a", Name: "a"}); err != nil {
		t.Fatalf("save a: %v", err)
	}
	// New ID that does not exist yet — should append, not replace.
	if err := svc.SaveTemplate(models.Template{ID: "id-b", Name: "b"}); err != nil {
		t.Fatalf("save b: %v", err)
	}

	got, _ := svc.LoadTemplates()
	if len(got) != 2 {
		t.Fatalf("expected 2 templates, got %d", len(got))
	}
}

func TestTemplateService_DeleteTemplate_RemovesEntry(t *testing.T) {
	templateServiceTestSetup(t)

	svc := NewTemplateService()
	_ = svc.SaveTemplate(models.Template{ID: "keep", Name: "keep"})
	_ = svc.SaveTemplate(models.Template{ID: "drop", Name: "drop"})

	if err := svc.DeleteTemplate("drop"); err != nil {
		t.Fatalf("DeleteTemplate: %v", err)
	}

	got, _ := svc.LoadTemplates()
	if len(got) != 1 {
		t.Fatalf("expected 1 template after delete, got %d", len(got))
	}
	if got[0].ID != "keep" {
		t.Errorf("expected the remaining template to be 'keep', got %q", got[0].ID)
	}
}

func TestTemplateService_DeleteTemplate_UnknownIDIsNoop(t *testing.T) {
	templateServiceTestSetup(t)

	svc := NewTemplateService()
	_ = svc.SaveTemplate(models.Template{ID: "only", Name: "only"})

	if err := svc.DeleteTemplate("does-not-exist"); err != nil {
		t.Fatalf("DeleteTemplate: %v", err)
	}

	got, _ := svc.LoadTemplates()
	if len(got) != 1 {
		t.Errorf("expected unchanged template list, got %d", len(got))
	}
}

func TestTemplateService_LoadTemplates_ReturnsCopy(t *testing.T) {
	templateServiceTestSetup(t)

	svc := NewTemplateService()
	_ = svc.SaveTemplate(models.Template{ID: "id", Name: "original"})

	got, _ := svc.LoadTemplates()
	if len(got) != 1 {
		t.Fatalf("expected 1 template, got %d", len(got))
	}
	// Mutate the returned slice — internal state should remain unchanged.
	got[0].Name = "mutated"

	got2, _ := svc.LoadTemplates()
	if got2[0].Name != "original" {
		t.Errorf("mutating returned slice affected internal state: %q", got2[0].Name)
	}
}
