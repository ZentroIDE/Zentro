// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"reflect"
	"testing"
)

func TestPickModelKeepsTheCurrentOneWhileItIsListed(t *testing.T) {
	ids := []string{"deepseek-reasoner", "deepseek-chat", "other"}
	if got := PickModel(ids, "other", "deepseek-chat"); got != "other" {
		t.Fatalf("a model the user chose was replaced: %q", got)
	}
}

func TestPickModelFallsBackToTheHintThenTheFirst(t *testing.T) {
	ids := []string{"alpha", "gpt-5.1-codex", "gpt-5-codex"}
	if got := PickModel(ids, "retired-model", "gpt-5"); got != "gpt-5.1-codex" {
		t.Fatalf("hint pick %q", got)
	}
	if got := PickModel(ids, "", "no-such-prefix"); got != "alpha" {
		t.Fatalf("first pick %q", got)
	}
	if got := PickModel(ids, "", ""); got != "alpha" {
		t.Fatalf("no hint pick %q", got)
	}
}

func TestPickModelNeverInventsAName(t *testing.T) {
	if got := PickModel(nil, "", "gpt-5"); got != "" {
		t.Fatalf("a name came from nowhere: %q", got)
	}
	if got := PickModel(nil, "stale", "gpt-5"); got != "" {
		t.Fatalf("a stale name outlived an empty list: %q", got)
	}
}

func TestOpenAIModelListLosesTheModelsThatCannotChat(t *testing.T) {
	listed := []string{
		"gpt-5-codex", "gpt-4.1", "text-embedding-3-large", "whisper-1", "tts-1",
		"dall-e-3", "omni-moderation-latest", "gpt-4o-transcribe", "gpt-4o-realtime-preview",
		"gpt-image-1", "davinci-002", "o3",
	}
	want := []string{"gpt-5-codex", "gpt-4.1", "o3"}
	for _, id := range []string{AdapterChat, AdapterResponses} {
		adapter, _ := AdapterByID(id)
		if got := adapter.UsableModels(listed); !reflect.DeepEqual(got, want) {
			t.Fatalf("%s kept %v", id, got)
		}
	}
}

func TestNoPresetCarriesAModelName(t *testing.T) {
	for _, preset := range ProviderPresets() {
		if preset.ModelHint == "" {
			t.Fatalf("preset %s has no hint to choose between listed models", preset.ID)
		}
	}
}
