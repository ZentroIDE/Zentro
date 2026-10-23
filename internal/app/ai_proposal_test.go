// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestProposalStoreExpiresPendingAndCapsQueue(t *testing.T) {
	store := &aiProposalStore{root: t.TempDir(), now: func() time.Time { return time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC) }}
	now := store.now()
	prop := AIChangeProposal{
		State:         aiProposalPending,
		Env:           "dev",
		SQL:           "update t set x = 1",
		SQLNormalized: "update t set x = ?",
		SQLHash:       "aaa",
		CreatedAt:     now.Add(-16 * time.Minute).UTC().Format(time.RFC3339),
		ExpiresAt:     now.Add(-time.Minute).UTC().Format(time.RFC3339),
		ProjectID:     "proj",
	}
	got, _, err := store.create("proj", prop)
	if err != nil {
		t.Fatal(err)
	}
	loaded, err := store.load("proj", got.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.State != aiProposalExpired {
		t.Fatalf("expired pending stayed %s", loaded.State)
	}

	store.now = func() time.Time { return time.Now().UTC() }
	for i := 0; i < aiMaxPendingChanges; i++ {
		_, _, err := store.create("proj", AIChangeProposal{
			State:         aiProposalPending,
			Env:           "dev",
			SQLHash:       string(rune('a' + i)),
			SQLNormalized: "sql",
			CreatedAt:     time.Now().UTC().Format(time.RFC3339),
			ExpiresAt:     time.Now().Add(15 * time.Minute).UTC().Format(time.RFC3339),
		})
		if err != nil {
			t.Fatalf("pending %d: %v", i, err)
		}
	}
	_, _, err = store.create("proj", AIChangeProposal{
		State:     aiProposalPending,
		Env:       "dev",
		SQLHash:   "overflow",
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		ExpiresAt: time.Now().Add(15 * time.Minute).UTC().Format(time.RFC3339),
	})
	if err == nil || err.Error() == "" {
		t.Fatal("sixth pending proposal was accepted")
	}
	if te, ok := err.(*aiToolError); !ok || te.Code != aiCodeRateLimited {
		t.Fatalf("want RATE_LIMITED, got %v", err)
	}
}

func TestProposalStoreDedupesAndTransitions(t *testing.T) {
	store := &aiProposalStore{root: t.TempDir(), now: time.Now}
	first, dup, err := store.create("proj", AIChangeProposal{
		State:     aiProposalPending,
		Env:       "dev",
		SQLHash:   "same",
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		ExpiresAt: time.Now().Add(15 * time.Minute).UTC().Format(time.RFC3339),
	})
	if err != nil || dup {
		t.Fatalf("first: dup=%v err=%v", dup, err)
	}
	second, dup, err := store.create("proj", AIChangeProposal{
		State:     aiProposalPending,
		Env:       "dev",
		SQLHash:   "same",
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
		ExpiresAt: time.Now().Add(15 * time.Minute).UTC().Format(time.RFC3339),
	})
	if err != nil || !dup || second.ID != first.ID {
		t.Fatalf("dedupe failed: dup=%v id=%s/%s err=%v", dup, first.ID, second.ID, err)
	}
	if _, err := store.transition("proj", first.ID, aiProposalApproved, nil); err != nil {
		t.Fatal(err)
	}
	if _, err := store.transition("proj", first.ID, aiProposalCancelled, nil); err == nil {
		t.Fatal("approved proposal was cancelled")
	}
	path := filepath.Join(store.root, "")
	_ = path
	entries, _ := os.ReadDir(store.root)
	if len(entries) == 0 {
		t.Fatal("no proposal directory")
	}
}

func TestProposalTTLByEnvironment(t *testing.T) {
	if proposalTTL("dev") != 15*time.Minute || proposalTTL("sta") != 10*time.Minute || proposalTTL("pro") != 5*time.Minute {
		t.Fatalf("ttl: dev=%s sta=%s pro=%s", proposalTTL("dev"), proposalTTL("sta"), proposalTTL("pro"))
	}
}
