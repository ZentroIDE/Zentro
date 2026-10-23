// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { showFeedbackPromptToast } from './FeedbackPromptToast';

// Give the app a moment to settle (auto-open, connection status, startup
// toasts) before competing for the user's attention with this ask.
const PROMPT_DELAY_MS = 4000;

/** Checks once per app session whether the one-time in-app feedback toast
 *  should show (gated server-side by launch count + never-asked-before, see
 *  ShouldPromptForFeedback in app_feedback_facade.go), and shows it. Marks
 *  the prompt as shown before rendering it so a crash/reload right after
 *  doesn't cause it to ask again. */
export function useFeedbackPrompt() {
    useEffect(() => {
        let cancelled = false;
        let timer: number | undefined;

        void (async () => {
            const settings = getApiGateway().settings;
            const result = await settings.shouldPromptForFeedback?.();
            if (cancelled || !result?.ok || !result.data) return;

            await settings.markFeedbackPrompted?.();
            if (cancelled) return;

            timer = window.setTimeout(() => {
                if (!cancelled) showFeedbackPromptToast();
            }, PROMPT_DELAY_MS);
        })().catch(() => {
            // Best-effort: never surface a failure for this low-friction ask.
        });

        return () => {
            cancelled = true;
            if (timer !== undefined) window.clearTimeout(timer);
        };
    }, []);
}
