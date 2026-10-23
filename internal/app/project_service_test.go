// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/go-git/go-git/v5"
	"github.com/go-git/go-git/v5/plumbing"

	"zentro/internal/extensions/license"
	"zentro/internal/models"
	"zentro/internal/utils"
)

func TestProjectServiceCreateProject_InitializesGitRepoInStoragePath(t *testing.T) {
	useTempProjectConfigDir(t)

	svc := NewProjectService(utils.NewLogger(nil))
	projectDir := filepath.Join(t.TempDir(), "my-project")

	created, err := svc.CreateProject(models.Project{
		Name:        "My Project",
		Slug:        "my-project",
		StoragePath: projectDir,
	})
	if err != nil {
		t.Fatalf("CreateProject error: %v", err)
	}
	if created == nil {
		t.Fatal("CreateProject returned nil project")
	}
	if created.StoragePath != projectDir {
		t.Fatalf("expected StoragePath=%q, got %q", projectDir, created.StoragePath)
	}

	if _, err := os.Stat(filepath.Join(projectDir, ".git")); err != nil {
		t.Fatalf("expected .git directory to exist: %v", err)
	}
	if _, err := git.PlainOpen(projectDir); err != nil {
		t.Fatalf("expected initialized git repo: %v", err)
	}
	repo, err := git.PlainOpen(projectDir)
	if err != nil {
		t.Fatalf("open repo: %v", err)
	}
	head, err := repo.Reference(plumbing.HEAD, false)
	if err != nil {
		t.Fatalf("read HEAD: %v", err)
	}
	if head.Target() != plumbing.NewBranchReferenceName("main") {
		t.Fatalf("expected HEAD target refs/heads/main, got %s", head.Target().String())
	}
	headRef, err := repo.Head()
	if err != nil {
		t.Fatalf("resolve HEAD commit: %v", err)
	}
	commit, err := repo.CommitObject(headRef.Hash())
	if err != nil {
		t.Fatalf("load HEAD commit: %v", err)
	}
	if commit.Message != initialProjectCommitMessage {
		t.Fatalf("expected initial commit message %q, got %q", initialProjectCommitMessage, commit.Message)
	}

	gitignorePath := filepath.Join(projectDir, ".gitignore")
	content, err := os.ReadFile(gitignorePath)
	if err != nil {
		t.Fatalf("expected .gitignore to exist: %v", err)
	}
	gitignoreText := string(content)
	if !strings.Contains(gitignoreText, "!scripts/queries/**/*.sql") {
		t.Fatalf("expected managed .gitignore to unignore tracked SQL path, got:\n%s", gitignoreText)
	}
	if !strings.Contains(gitignoreText, "!artifacts/source-control/schema/**") {
		t.Fatalf("expected managed .gitignore to unignore schema snapshot artifacts, got:\n%s", gitignoreText)
	}

	before := gitignoreText
	if err := ensureManagedProjectGitIgnore(projectDir); err != nil {
		t.Fatalf("ensureManagedProjectGitIgnore failed: %v", err)
	}
	afterBytes, err := os.ReadFile(gitignorePath)
	if err != nil {
		t.Fatalf("read .gitignore after ensure failed: %v", err)
	}
	if string(afterBytes) != before {
		t.Fatalf("expected idempotent .gitignore merge, before=%q after=%q", before, string(afterBytes))
	}
}

func TestProjectServiceColorRoundTripsThroughManifest(t *testing.T) {
	useTempProjectConfigDir(t)

	svc := NewProjectService(utils.NewLogger(nil))
	created, err := svc.CreateProject(models.Project{
		Name:        "Colored Project",
		Slug:        "colored-project",
		Color:       "teal",
		StoragePath: filepath.Join(t.TempDir(), "colored-project"),
	})
	if err != nil {
		t.Fatalf("CreateProject error: %v", err)
	}
	if created.Color != "teal" {
		t.Fatalf("created.Color = %q, want %q", created.Color, "teal")
	}

	loaded, err := svc.GetProject(created.ID)
	if err != nil {
		t.Fatalf("GetProject error: %v", err)
	}
	if loaded.Color != "teal" {
		t.Fatalf("loaded.Color = %q, want %q", loaded.Color, "teal")
	}
}

// capEntitlements fixes the project limit a test runs against, instead of
// relying on whatever an edition wires into a fresh App by default (a build
// with the license service caps the free plan at the catalog's value; the
// exported core tree has no license service and imposes no cap at all). This
// test is about OpenProjectFromDirectory's own enforcement, not about which
// edition is present.
type capEntitlements struct {
	license.Entitlements
	cap int64
}

func (c capEntitlements) GetLimitValue(id license.LimitID) int64 {
	if id == license.LimitMaxProjects {
		return c.cap
	}
	return c.Entitlements.GetLimitValue(id)
}

func TestAppOpenProjectFromDirectory_BlocksNewAdmissionAtFreeCap(t *testing.T) {
	useTempProjectConfigDir(t)

	app := newProjectTestApp(t)
	app.svc.License = capEntitlements{Entitlements: license.NewLocalEntitlements(), cap: 5}
	for i := 0; i < 5; i++ {
		createProjectAtPath(t, app, fmt.Sprintf("Project %d", i+1), filepath.Join(t.TempDir(), fmt.Sprintf("project-%d", i+1)))
	}

	importDir := filepath.Join(t.TempDir(), "import-new")
	writeProjectManifest(t, importDir, models.Project{
		ID:   "import-new",
		Name: "Import New",
		Slug: "import-new",
	})

	_, err := app.OpenProjectFromDirectory(importDir)
	if err == nil {
		t.Fatal("expected sixth project admission to be blocked on free")
	}
	if !strings.Contains(err.Error(), "free plan limit:") {
		t.Fatalf("expected free plan limit error, got %v", err)
	}
}

func TestAppOpenProjectFromDirectory_AllowsRelinkForAdmittedProjectAtFreeCap(t *testing.T) {
	useTempProjectConfigDir(t)

	app := newProjectTestApp(t)
	app.svc.License = capEntitlements{Entitlements: license.NewLocalEntitlements(), cap: 5}
	admittedDir := filepath.Join(t.TempDir(), "admitted-project")
	admitted := createProjectAtPath(t, app, "Admitted Project", admittedDir)
	for i := 0; i < 4; i++ {
		createProjectAtPath(t, app, fmt.Sprintf("Extra %d", i+1), filepath.Join(t.TempDir(), fmt.Sprintf("extra-%d", i+1)))
	}

	movedDir := filepath.Join(t.TempDir(), "moved-admitted-project")
	if err := os.Rename(admittedDir, movedDir); err != nil {
		t.Fatalf("rename admitted project failed: %v", err)
	}

	reopened, err := app.OpenProjectFromDirectory(movedDir)
	if err != nil {
		t.Fatalf("expected relinked admitted project to reopen at cap, got %v", err)
	}
	if reopened.StoragePath != movedDir {
		t.Fatalf("expected reopened storage path %q, got %q", movedDir, reopened.StoragePath)
	}

	projects, err := app.ListProjects()
	if err != nil {
		t.Fatalf("list projects failed: %v", err)
	}
	if len(projects) != 5 {
		t.Fatalf("expected relink to preserve 5 admitted projects, got %d", len(projects))
	}

	persisted, err := app.GetProject(admitted.ID)
	if err != nil {
		t.Fatalf("load relinked project failed: %v", err)
	}
	if persisted.StoragePath != movedDir {
		t.Fatalf("expected persisted storage path %q, got %q", movedDir, persisted.StoragePath)
	}
}

func TestAppOpenProjectFromDirectory_RejectsCopiedFolderForExistingProject(t *testing.T) {
	useTempProjectConfigDir(t)

	app := newProjectTestApp(t)
	admittedDir := filepath.Join(t.TempDir(), "admitted-project")
	admitted := createProjectAtPath(t, app, "Admitted Project", admittedDir)
	cloneDir := filepath.Join(t.TempDir(), "cloned-project")
	writeProjectManifest(t, cloneDir, models.Project{
		ID:   admitted.ID,
		Name: admitted.Name,
		Slug: admitted.Slug,
	})

	_, err := app.OpenProjectFromDirectory(cloneDir)
	if err == nil {
		t.Fatal("expected copied folder import to be rejected")
	}
	if !strings.Contains(err.Error(), "already admitted from another folder") {
		t.Fatalf("expected existing-project folder rejection, got %v", err)
	}
}

func TestAppOpenProjectFromDirectory_ReportsFolderWithoutManifest(t *testing.T) {
	useTempProjectConfigDir(t)

	app := newProjectTestApp(t)
	_, err := app.OpenProjectFromDirectory(t.TempDir())
	if !errors.Is(err, ErrNotZentroProject) {
		t.Fatalf("expected ErrNotZentroProject, got %v", err)
	}
}

func useTempProjectConfigDir(t *testing.T) {
	t.Helper()
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	t.Setenv("APPDATA", t.TempDir())
	t.Setenv("HOME", t.TempDir())
}

func newProjectTestApp(t *testing.T) *App {
	t.Helper()
	app := NewApp()
	app.svc.AppLog = NewAppLogFile("")
	t.Cleanup(app.svc.AppLog.Close)
	return app
}

func createProjectAtPath(t *testing.T, app *App, name string, storagePath string) *models.Project {
	t.Helper()
	project, err := app.CreateProject(models.Project{
		Name:        name,
		Slug:        models.Slugify(name),
		StoragePath: storagePath,
	})
	if err != nil {
		t.Fatalf("create project %q failed: %v", name, err)
	}
	return project
}

func writeProjectManifest(t *testing.T, dir string, project models.Project) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir manifest dir failed: %v", err)
	}
	project.StoragePath = dir
	data, err := json.MarshalIndent(project, "", "  ")
	if err != nil {
		t.Fatalf("marshal project manifest failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "project.json"), data, 0o644); err != nil {
		t.Fatalf("write project manifest failed: %v", err)
	}
}
