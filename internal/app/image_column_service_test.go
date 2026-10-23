// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"testing"
)

func TestImageColumnServiceCRUD(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("APPDATA", tmp)
	t.Setenv("XDG_CONFIG_HOME", tmp)
	t.Setenv("HOME", tmp)

	svc := NewImageColumnService()
	connKey := "profile-1:db-1:postgres"
	tableKey := "public.products"

	if err := svc.SetImageColumn(connKey, tableKey, "avatar_url", true); err != nil {
		t.Fatalf("mark avatar_url: %v", err)
	}
	if err := svc.SetImageColumn(connKey, tableKey, "thumbnail_url", true); err != nil {
		t.Fatalf("mark thumbnail_url: %v", err)
	}

	columns, err := svc.GetImageColumns(connKey, tableKey)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if len(columns) != 2 {
		t.Fatalf("expected 2 marked columns, got %d: %+v", len(columns), columns)
	}

	if err := svc.SetImageColumn(connKey, tableKey, "avatar_url", false); err != nil {
		t.Fatalf("unmark avatar_url: %v", err)
	}
	columns, err = svc.GetImageColumns(connKey, tableKey)
	if err != nil {
		t.Fatalf("get after unmark: %v", err)
	}
	if len(columns) != 1 || columns[0] != "thumbnail_url" {
		t.Fatalf("unexpected columns after unmark: %+v", columns)
	}

	// Unmarking an already-unmarked column is a no-op, not an error.
	if err := svc.SetImageColumn(connKey, tableKey, "avatar_url", false); err != nil {
		t.Fatalf("unmark already-unmarked column: %v", err)
	}

	reloaded := NewImageColumnService()
	columns, err = reloaded.GetImageColumns(connKey, tableKey)
	if err != nil {
		t.Fatalf("reload get: %v", err)
	}
	if len(columns) != 1 || columns[0] != "thumbnail_url" {
		t.Fatalf("unexpected columns after reload: %+v", columns)
	}
}

func TestImageColumnServiceGetByConnection(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("APPDATA", tmp)
	t.Setenv("XDG_CONFIG_HOME", tmp)
	t.Setenv("HOME", tmp)

	svc := NewImageColumnService()
	connKey := "profile-1:db-1:postgres"

	if err := svc.SetImageColumn(connKey, "public.products", "thumbnail_url", true); err != nil {
		t.Fatalf("mark products.thumbnail_url: %v", err)
	}
	if err := svc.SetImageColumn(connKey, "public.products", "banner_url", true); err != nil {
		t.Fatalf("mark products.banner_url: %v", err)
	}
	if err := svc.SetImageColumn(connKey, "public.users", "avatar_url", true); err != nil {
		t.Fatalf("mark users.avatar_url: %v", err)
	}

	grouped, err := svc.GetImageColumnsByConnection(connKey)
	if err != nil {
		t.Fatalf("get by connection: %v", err)
	}
	if len(grouped) != 2 {
		t.Fatalf("expected 2 table groups, got %d: %+v", len(grouped), grouped)
	}
	if len(grouped["public.products"]) != 2 || grouped["public.products"][0] != "banner_url" ||
		grouped["public.products"][1] != "thumbnail_url" {
		t.Fatalf("unexpected products columns: %+v", grouped["public.products"])
	}
	if len(grouped["public.users"]) != 1 || grouped["public.users"][0] != "avatar_url" {
		t.Fatalf("unexpected users columns: %+v", grouped["public.users"])
	}
}

func TestImageColumnServiceRequiresIdentity(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("APPDATA", tmp)
	t.Setenv("XDG_CONFIG_HOME", tmp)
	t.Setenv("HOME", tmp)

	svc := NewImageColumnService()
	if err := svc.SetImageColumn("", "public.products", "thumbnail_url", true); err == nil {
		t.Fatal("expected error for empty connectionKey")
	}
	if err := svc.SetImageColumn("conn-1", "", "thumbnail_url", true); err == nil {
		t.Fatal("expected error for empty tableKey")
	}
	if err := svc.SetImageColumn("conn-1", "public.products", "", true); err == nil {
		t.Fatal("expected error for empty column")
	}
}
