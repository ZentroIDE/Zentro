// SPDX-License-Identifier: GPL-3.0-only

package app

// ShouldPromptForFeedback reports whether the one-time in-app feedback
// toast should show this session. Call MarkFeedbackPrompted immediately
// once the toast actually renders, so a crash before that doesn't burn
// the one and only ask.
func (a *App) ShouldPromptForFeedback() bool {
	return a.svc.Feedback.ShouldPrompt()
}

// MarkFeedbackPrompted records that the feedback toast was shown, so it
// never asks again regardless of how the user responds.
func (a *App) MarkFeedbackPrompted() error {
	return a.svc.Feedback.MarkPrompted()
}

// SubmitFeedback posts a 1-5 rating and optional comment to the Zentro
// backend. Best-effort — callers should not surface network failures to
// the user for what's meant to be a low-friction ask.
func (a *App) SubmitFeedback(rating int, comment string) error {
	return a.svc.Feedback.Submit(rating, comment)
}
