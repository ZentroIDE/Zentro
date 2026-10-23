// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"net/http"
	"net/http/httptest"
	goruntime "runtime"
	"testing"
)

func TestIsNewer(t *testing.T) {
	tests := []struct {
		name    string
		current string
		latest  string
		want    bool
	}{
		{"patch bump", "v0.1.0", "v0.2.0", true},
		{"equal", "v0.2.0", "v0.2.0", false},
		{"older latest", "v0.3.0", "v0.2.0", false},
		{"double-digit minor sorts correctly", "v0.9.0", "v0.10.0", true},
		{"empty current is conservative, not a free pass", "", "v0.1.0", false},
		{"invalid latest never counts as an update", "v0.1.0", "not-a-version", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isNewer(tt.current, tt.latest); got != tt.want {
				t.Errorf("isNewer(%q, %q) = %v; want %v", tt.current, tt.latest, got, tt.want)
			}
		})
	}
}

func TestCheckForUpdates(t *testing.T) {
	t.Run("newer release available", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if got := r.URL.Path; got != "/api/v1/releases/latest" {
				t.Errorf("unexpected path: %s", got)
			}
			q := r.URL.Query()
			if q.Get("channel") != "stable" {
				t.Errorf("expected channel=stable, got %q", q.Get("channel"))
			}
			if q.Get("platform") == "" || q.Get("arch") == "" {
				t.Errorf("expected platform/arch to be set, got platform=%q arch=%q", q.Get("platform"), q.Get("arch"))
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{
				"version": "0.3.0",
				"downloadUrl": "https://cdn.example.com/zentro-v0.3.0-installer.exe",
				"checksumSha256": "deadbeef",
				"changelog": "Fixes and improvements"
			}`))
		}))
		defer server.Close()

		svc := NewUpdateService(server.URL, "stable")
		info, err := svc.CheckForUpdates("0.2.0")
		if err != nil {
			t.Fatalf("CheckForUpdates failed: %v", err)
		}
		if !info.HasUpdate {
			t.Error("expected HasUpdate=true")
		}
		if info.LatestVersion != "0.3.0" {
			t.Errorf("expected LatestVersion=0.3.0, got %q", info.LatestVersion)
		}
		if info.DownloadURL != "https://cdn.example.com/zentro-v0.3.0-installer.exe" {
			t.Errorf("unexpected DownloadURL: %q", info.DownloadURL)
		}
		if info.ChecksumSHA256 != "deadbeef" {
			t.Errorf("unexpected ChecksumSHA256: %q", info.ChecksumSHA256)
		}
	})

	t.Run("nightly channel reaches the query string", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if got := r.URL.Query().Get("channel"); got != "nightly" {
				t.Errorf("expected channel=nightly, got %q", got)
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"version": "0.2.0", "downloadUrl": "https://cdn.example.com/x"}`))
		}))
		defer server.Close()

		svc := NewUpdateService(server.URL, "nightly")
		if _, err := svc.CheckForUpdates("0.2.0"); err != nil {
			t.Fatalf("CheckForUpdates failed: %v", err)
		}
	})

	t.Run("already on latest", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"version": "0.2.0", "downloadUrl": "https://cdn.example.com/x"}`))
		}))
		defer server.Close()

		svc := NewUpdateService(server.URL, "stable")
		info, err := svc.CheckForUpdates("0.2.0")
		if err != nil {
			t.Fatalf("CheckForUpdates failed: %v", err)
		}
		if info.HasUpdate {
			t.Error("expected HasUpdate=false when already on the latest version")
		}
	})

	t.Run("no release registered for this platform yet", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusNotFound)
		}))
		defer server.Close()

		svc := NewUpdateService(server.URL, "stable")
		info, err := svc.CheckForUpdates("0.2.0")
		if err != nil {
			t.Fatalf("expected no error on 404, got: %v", err)
		}
		if info.HasUpdate {
			t.Error("expected HasUpdate=false")
		}
	})
}

func TestReleaseAPIArch(t *testing.T) {
	if goruntime.GOOS != "linux" {
		t.Skip("AppImage arch selection only branches on linux")
	}

	t.Run("no AppImage env - checks the raw amd64 row", func(t *testing.T) {
		t.Setenv("APPIMAGE", "")
		if got := releaseAPIArch(); got != "amd64" {
			t.Errorf("expected amd64, got %q", got)
		}
	})

	t.Run("running as AppImage - checks the amd64-appimage row", func(t *testing.T) {
		t.Setenv("APPIMAGE", "/home/user/Applications/zentro.AppImage")
		if got := releaseAPIArch(); got != "amd64-appimage" {
			t.Errorf("expected amd64-appimage, got %q", got)
		}
	})
}

func TestCanAutoUpdateThisInstall_LinuxNeedsAppImage(t *testing.T) {
	if goruntime.GOOS != "linux" {
		t.Skip("this assertion only applies to the linux branch")
	}

	t.Setenv("APPIMAGE", "")
	if canAutoUpdateThisInstall() {
		t.Error("expected no auto-update capability without $APPIMAGE set")
	}

	t.Setenv("APPIMAGE", "/home/user/Applications/zentro.AppImage")
	if !canAutoUpdateThisInstall() {
		t.Error("expected auto-update capability when running as an AppImage")
	}
}
