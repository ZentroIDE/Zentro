// SPDX-License-Identifier: GPL-3.0-only

package ai

import "strings"

// notChat are parts of a model name that mark a model made for something other
// than chat. OpenAI lists all of its models, not only the ones that chat.
var notChat = []string{
	"embedding", "whisper", "tts", "dall-e", "moderation", "transcribe",
	"realtime", "audio", "image", "babbage", "davinci",
}

// openAIChatModels drops the listed models that cannot chat. Hosts that only
// serve chat models, such as DeepSeek, lose nothing.
func openAIChatModels(ids []string) []string {
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		lower := strings.ToLower(id)
		usable := true
		for _, part := range notChat {
			if strings.Contains(lower, part) {
				usable = false
				break
			}
		}
		if usable {
			out = append(out, id)
		}
	}
	return out
}

// PickModel chooses the model to use from the list a host returned. The model
// the user already has stays when it is still listed. Otherwise the first model
// that starts with the preset's hint wins, then the first in the list. An empty
// list gives an empty name, so no model is ever assumed.
func PickModel(ids []string, current, hint string) string {
	for _, id := range ids {
		if id == current && current != "" {
			return id
		}
	}
	if hint = strings.ToLower(strings.TrimSpace(hint)); hint != "" {
		for _, id := range ids {
			if strings.HasPrefix(strings.ToLower(id), hint) {
				return id
			}
		}
	}
	if len(ids) > 0 {
		return ids[0]
	}
	return ""
}
