// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"testing"

	"zentro/internal/models"
)

func TestSpawnInstanceForProjectRequiresID(t *testing.T) {
	if err := spawnInstanceForProject(""); err == nil {
		t.Fatal("expected error for empty project id")
	}
}

func TestOpenProjectInNewWindowNoopsForCurrentlyActiveProject(t *testing.T) {
	// Opening "in a new window" the exact project already active in THIS
	// window is a no-op — no duplicate window, no lock check needed at all
	// (a.svc.ProjectLock is deliberately left nil to prove this path never
	// touches it).
	a := &App{project: &models.Project{ID: "p1", Name: "Project One"}}

	if err := a.OpenProjectInNewWindow("p1"); err != nil {
		t.Fatalf("OpenProjectInNewWindow(own active project) error = %v, want nil", err)
	}
}

func TestGetLaunchProjectIDConsumesOnce(t *testing.T) {
	a := &App{}
	a.SetLaunchProjectID("p1")

	if got := a.GetLaunchProjectID(); got != "p1" {
		t.Fatalf("GetLaunchProjectID() = %q, want %q", got, "p1")
	}
	if got := a.GetLaunchProjectID(); got != "" {
		t.Fatalf("second GetLaunchProjectID() = %q, want empty", got)
	}
}
