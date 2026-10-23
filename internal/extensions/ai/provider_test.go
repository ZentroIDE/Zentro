// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestListModelsReturnsIDsAndRefusesRedirect(t *testing.T) {
	var sawAuth string
	ok := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawAuth = r.Header.Get("Authorization")
		if r.Method != http.MethodGet {
			t.Fatalf("method %s", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"gpt-5-codex"},{"id":"deepseek-chat"}]}`))
	}))
	defer ok.Close()

	ids, err := ListModels(context.Background(), ok.URL, "secret-key")
	if err != nil {
		t.Fatal(err)
	}
	if sawAuth != "Bearer secret-key" || len(ids) != 2 || ids[0] != "gpt-5-codex" {
		t.Fatalf("ids %v auth %q", ids, sawAuth)
	}

	redirect := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, ok.URL, http.StatusFound)
	}))
	defer redirect.Close()
	if _, err := ListModels(context.Background(), redirect.URL, "secret-key"); err == nil {
		t.Fatal("redirect was followed or accepted")
	}
}
