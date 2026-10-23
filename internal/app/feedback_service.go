// SPDX-License-Identifier: GPL-3.0-only

package app

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	goruntime "runtime"
	"strings"
	"time"

	"zentro/internal/utils"
)

// feedbackAPIBaseURL mirrors publicDownloadURL's ZENTRO_APP_URL override
// (update_service.go) rather than the license package's own copy, since
// feedback isn't a licensing concern.
func feedbackAPIBaseURL() string {
	u := strings.TrimSpace(os.Getenv("ZENTRO_APP_URL"))
	if u != "" {
		return u
	}
	return "https://zentro-ide.com"
}

// feedbackPromptAfterLaunches gates the one-time in-app feedback ask behind
// a handful of sessions, so it never greets a first-time user.
const feedbackPromptAfterLaunches = 5

// feedbackSubmitPayload is the JSON body posted to POST /api/v1/app/feedback.
type feedbackSubmitPayload struct {
	InstallationID string `json:"installation_id"`
	Rating         int    `json:"rating"`
	Comment        string `json:"comment"`
	AppVersion     string `json:"app_version"`
	Platform       string `json:"platform"`
}

// FeedbackService tracks whether the one-time "rate your experience" toast
// should show this session, and posts the user's rating/comment to the
// Zentro backend when they respond. Mirrors the license HTTPProvider's
// postJSON pattern (internal/extensions/license/pro_provider_http.go) but is
// kept independent of the license package: feedback isn't a licensing
// concern and doesn't need a swappable provider.
type FeedbackService struct {
	getPrefs          func() utils.Preferences
	setPrefs          func(utils.Preferences) error
	getInstallationID func() string
	baseURL           string
	client            *http.Client
}

func NewFeedbackService(
	getPrefs func() utils.Preferences,
	setPrefs func(utils.Preferences) error,
	getInstallationID func() string,
) *FeedbackService {
	return &FeedbackService{
		getPrefs:          getPrefs,
		setPrefs:          setPrefs,
		getInstallationID: getInstallationID,
		baseURL:           strings.TrimRight(feedbackAPIBaseURL(), "/"),
		client:            &http.Client{Timeout: 10 * time.Second},
	}
}

// RecordLaunch increments the session/launch counter. Called once per
// process start from App.Startup.
func (s *FeedbackService) RecordLaunch() {
	prefs := s.getPrefs()
	prefs.LaunchCount++
	_ = s.setPrefs(prefs)
}

// ShouldPrompt reports whether the one-time feedback toast should show this
// session: enough launches have happened and it has never been shown.
func (s *FeedbackService) ShouldPrompt() bool {
	prefs := s.getPrefs()
	return prefs.FeedbackPromptedAt == "" && prefs.LaunchCount >= feedbackPromptAfterLaunches
}

// MarkPrompted records that the toast was shown, so ShouldPrompt never
// returns true again regardless of whether the user submits or dismisses it.
func (s *FeedbackService) MarkPrompted() error {
	prefs := s.getPrefs()
	prefs.FeedbackPromptedAt = time.Now().UTC().Format(time.RFC3339)
	return s.setPrefs(prefs)
}

// Submit posts a 1-5 rating and optional free-text comment to the backend.
// Best-effort: the caller should treat this as fire-and-forget from the
// user's perspective and never block or re-prompt on failure. Uses the same
// installation_id the license system already established (via bootstrap on
// startup), since the backend's feedback table has a FK against it — a raw
// machine hash wouldn't satisfy that constraint.
func (s *FeedbackService) Submit(rating int, comment string) error {
	installationID := s.getInstallationID()
	if strings.TrimSpace(installationID) == "" {
		return fmt.Errorf("feedback: no installation id available yet")
	}

	payload := feedbackSubmitPayload{
		InstallationID: installationID,
		Rating:         rating,
		Comment:        strings.TrimSpace(comment),
		AppVersion:     Version,
		Platform:       goruntime.GOOS,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, s.baseURL+"/api/v1/app/feedback", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("feedback: server returned %s", resp.Status)
	}
	return nil
}
