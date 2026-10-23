// SPDX-License-Identifier: GPL-3.0-only

package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const maxModels = 200

// ListModels GETs an OpenAI-compatible /v1/models URL. It does not follow
// redirects and does not log the API key. Sending a chat request is in Send.
func ListModels(ctx context.Context, endpoint, apiKey string) ([]string, error) {
	if strings.TrimSpace(apiKey) == "" {
		return nil, fmt.Errorf("save a model key before testing this provider")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("build model list request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	raw, status, err := doJSON(ctx, req)
	if err != nil {
		return nil, err
	}
	if status >= 300 && status < 400 {
		return nil, fmt.Errorf("model host returned a redirect, which was not followed")
	}
	ids, apiMessage, understood := readModelIDs(raw)
	if !understood {
		if status >= 400 {
			return nil, fmt.Errorf("model rejected the request (%d)", status)
		}
		return nil, fmt.Errorf("model list was not understood")
	}
	if status >= 400 {
		return nil, rejection(apiMessage, apiKey, status)
	}
	if len(ids) == 0 {
		return nil, fmt.Errorf("this key did not return any models")
	}
	if len(ids) > maxModels {
		ids = ids[:maxModels]
	}
	return ids, nil
}

func doJSON(ctx context.Context, req *http.Request) ([]byte, int, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	client := &http.Client{
		Timeout: 60 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	resp, err := client.Do(req.WithContext(ctx))
	if err != nil {
		return nil, 0, fmt.Errorf("model request failed")
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read model response")
	}
	return raw, resp.StatusCode, nil
}

func readModelIDs(raw []byte) ([]string, string, bool) {
	if !json.Valid(raw) {
		return nil, "", false
	}
	var parsed struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, "", false
	}
	apiMessage := ""
	if parsed.Error != nil {
		apiMessage = parsed.Error.Message
	}
	seen := map[string]bool{}
	ids := make([]string, 0, len(parsed.Data))
	for _, item := range parsed.Data {
		id := strings.TrimSpace(item.ID)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	return ids, apiMessage, true
}
