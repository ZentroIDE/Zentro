// SPDX-License-Identifier: GPL-3.0-only

import React, {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useAISettingsStore } from '../../stores/aiSettingsStore';
import { useAIChatStore } from '../../stores/aiChatStore';
import { activeAIProvider } from '../../lib/aiAssistant';
import { sessionUsageTotals } from '../../lib/aiTokens';
import { AssistantReview, SensitiveNotice } from './AssistantReview';
import { AssistantMentionPopup, mentionOptionId } from './AssistantMention';
import { AssistantComposer, AssistantTokenBar } from './AssistantComposer';
import { AssistantQuestions, MIN_QUESTIONS_FOR_NAV } from './AssistantQuestions';
import { questionItems } from '../../lib/aiQuestionNav';
import { AssistantSetup } from './AssistantSetup';
import {
    extractMentions,
    findMentionQuery,
    insertMention,
    mentionCandidates,
    type MentionCandidate,
    type MentionQuery,
} from './mention';

export interface AssistantInputHandle {
    // fill puts text in the message box and focuses it.
    fill: (text: string) => void;
}

// AssistantInput is everything the user types into: the message box, the
// mention list, the data notice, and the setup popover. The text and the caret
// live here, not in the panel, so a key press renders this part only and the
// conversation above it stays as it was.
export const AssistantInput = forwardRef<AssistantInputHandle>(
    function AssistantInput(_props, handleRef) {
        const settings = useAISettingsStore(state => state.settings);
        const storeBusy = useAISettingsStore(state => state.busy);
        const selectModel = useAISettingsStore(state => state.selectModel);
        const saveSettings = useAISettingsStore(state => state.save);

        const turns = useAIChatStore(state => state.session?.turns);
        const chatGranted = useAIChatStore(state =>
            Boolean(state.session && state.grants[state.session.id]),
        );
        // "Send without review in this project" works like an approval for
        // every chat of the project (the backend checks the same switch).
        const autoApprove = Boolean(settings?.autoApprove);
        const granted = chatGranted || autoApprove;
        const review = useAIChatStore(state => state.review);
        const hold = useAIChatStore(state => state.hold);
        const pending = useAIChatStore(state => state.pending);
        const mentions = useAIChatStore(state => state.mentions);
        const chatBusy = useAIChatStore(state => state.busy);
        const send = useAIChatStore(state => state.send);
        const requestReview = useAIChatStore(state => state.requestReview);
        const clearReview = useAIChatStore(state => state.clearReview);
        const revoke = useAIChatStore(state => state.revoke);
        const stop = useAIChatStore(state => state.stop);

        const [message, setMessage] = useState('');
        const [setupOpenState, setSetupOpen] = useState<boolean | null>(null);
        const [mentionFound, setMentionFound] = useState<MentionQuery | null>(null);
        const [mentionIndex, setMentionIndex] = useState(0);
        const [caret, setCaret] = useState(0);
        const inputRef = useRef<HTMLTextAreaElement>(null);

        useEffect(() => {
            if (!inputRef.current) return;
            inputRef.current.setSelectionRange(caret, caret);
        }, [caret]);

        useImperativeHandle(
            handleRef,
            () => ({
                fill: text => {
                    setMessage(text);
                    setCaret(text.length);
                    inputRef.current?.focus();
                },
            }),
            [],
        );

        const mentionItems = useMemo(
            () => (mentionFound ? mentionCandidates(mentions, mentionFound.query) : []),
            [mentions, mentionFound],
        );
        // The include-text switch belongs to the project, so the chat and external
        // MCP agents follow the same choice.
        const includeBodies = Boolean(settings?.includeBodies);
        const usageTotals = useMemo(() => sessionUsageTotals(turns ?? []), [turns]);

        if (!settings) return null;

        const provider = activeAIProvider(settings);
        const ready =
            settings.enabled &&
            !settings.connectionDisabled &&
            Boolean(provider?.hasKey) &&
            Boolean(settings.model);
        // The setup popover opens by itself until a provider has a key.
        const setupOpen = setupOpenState ?? !ready;
        const modelChoices = Array.from(
            new Set([...(provider?.models ?? []), settings.model].filter(Boolean)),
        );
        const busy = chatBusy || storeBusy;
        const reviewReady = Boolean(review && review.sendToken && !review.held);
        const sendDisabled = !granted && !reviewReady && message.trim() === '';
        const activeIndex = Math.min(mentionIndex, Math.max(mentionItems.length - 1, 0));

        const pickMention = (item: MentionCandidate) => {
            if (!mentionFound) return;
            const next = insertMention(message, mentionFound, caret, item.value);
            setMessage(next.text);
            setCaret(next.caret);
            setMentionFound(null);
        };

        const questions = React.useMemo(() => questionItems(turns, pending), [turns, pending]);

        const clearInput = () => {
            setMessage('');
            setMentionFound(null);
        };

        // sendNow empties the box as the question goes, and puts the text back
        // when it did not go (an error, a hold, or an approval that no longer
        // matches, which shows the review again).
        const sendNow = async (input: Parameters<typeof send>[0]): Promise<boolean> => {
            clearInput();
            const sent = await send(input);
            if (sent) return true;
            setMessage(input.message);
            if (useAIChatStore.getState().reviewNeeded) {
                useAIChatStore.setState({ reviewNeeded: false });
                await requestReview({
                    message: input.message,
                    mentions: input.mentions,
                    includeBodies: input.includeBodies,
                    acceptHost: false,
                    acknowledgeSensitive: input.acknowledgeSensitive,
                    grant: false,
                });
            }
            return false;
        };

        // With an approval for this chat, a send goes straight through. Otherwise the
        // first Send shows the data notice, and the second sends that exact body once.
        const submit = async (
            overrides: { acknowledgeSensitive?: boolean; acceptHost?: boolean } = {},
        ) => {
            const text = message.trim();
            if (!text && !hold) return;
            const question = hold?.message ?? text;
            const found = extractMentions(question, mentions);
            const acknowledgeSensitive = Boolean(overrides.acknowledgeSensitive);
            const acceptHost = Boolean(overrides.acceptHost);
            // With an approval (this chat or the whole project), "Send anyway" on
            // a sensitive hold sends straight away; it must not bring back the
            // review the user already gave.
            if (granted && !acceptHost) {
                await sendNow({
                    message: question,
                    mentions: found,
                    includeBodies,
                    acknowledgeSensitive,
                    sendToken: '',
                });
                return;
            }
            if (!reviewReady || acknowledgeSensitive || acceptHost) {
                await requestReview({
                    message: question,
                    mentions: found,
                    includeBodies,
                    acceptHost,
                    acknowledgeSensitive,
                    grant: false,
                });
                return;
            }
            await sendNow({
                message: question,
                mentions: found,
                includeBodies,
                acknowledgeSensitive: (review?.matches?.length ?? 0) > 0,
                sendToken: review?.sendToken ?? '',
            });
        };

        // Allow keeps the approval for this chat and sends the question that is waiting.
        const allowForChat = async () => {
            const question = message.trim();
            if (!question) return;
            const found = extractMentions(question, mentions);
            const acknowledgeSensitive = (review?.matches?.length ?? 0) > 0;
            const reviewed = await requestReview({
                message: question,
                mentions: found,
                includeBodies,
                acceptHost: false,
                acknowledgeSensitive,
                grant: true,
            });
            if (!reviewed || reviewed.held || !reviewed.sendToken) return;
            await sendNow({
                message: question,
                mentions: found,
                includeBodies,
                acknowledgeSensitive,
                sendToken: reviewed.sendToken,
            });
        };

        // Allow for project turns on "send without review" for the whole project,
        // then sends the question that is waiting, as Allow does for a chat.
        const allowForProject = async () => {
            if (settings) await saveSettings({ ...settings, autoApprove: true });
            await allowForChat();
        };

        // Enter sends and Shift+Enter adds a line. While the mention list is open,
        // Enter inserts the highlighted item instead. Keys that finish an IME
        // composition (Vietnamese, Chinese, Japanese) never send.
        const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.nativeEvent.isComposing) return;
            if (mentionFound && mentionItems.length > 0) {
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setMentionIndex(index => (index + 1) % mentionItems.length);
                } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setMentionIndex(
                        index => (index - 1 + mentionItems.length) % mentionItems.length,
                    );
                } else if (event.key === 'Enter' || event.key === 'Tab') {
                    event.preventDefault();
                    pickMention(mentionItems[activeIndex]);
                } else if (event.key === 'Escape') {
                    setMentionFound(null);
                }
                return;
            }
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (ready && !busy && !pending && !sendDisabled) void submit();
            }
        };

        const notice = review ? (
            <AssistantReview
                review={review}
                providerLabel={provider?.label ?? 'The model'}
                busy={busy}
                holdReason={review.holdReason}
                matches={review.matches ?? []}
                onAllowChat={() => void allowForChat()}
                onAllowProject={() => void allowForProject()}
                onAllowHost={() => void submit({ acceptHost: true })}
                onKeepSensitive={() => void submit({ acknowledgeSensitive: true })}
            />
        ) : hold ? (
            <SensitiveNotice
                matches={hold.matches}
                busy={busy}
                onKeep={() => void submit({ acknowledgeSensitive: true })}
            />
        ) : undefined;

        return (
            <div className='flex flex-col gap-1.5 p-3 pt-1'>
                <AssistantTokenBar
                    total={usageTotals}
                    left={<AssistantQuestions items={questions} />}
                />
                <AssistantComposer
                    textareaRef={inputRef}
                    message={message}
                    placeholder='Ask about this Project…'
                    disabled={!ready || busy}
                    busy={busy}
                    activeDescendant={
                        mentionFound && mentionItems.length > 0
                            ? mentionOptionId(activeIndex)
                            : undefined
                    }
                    notice={notice}
                    popup={
                        mentionFound && mentionItems.length > 0 ? (
                            <AssistantMentionPopup
                                items={mentionItems}
                                activeIndex={activeIndex}
                                onPick={pickMention}
                                onHover={setMentionIndex}
                            />
                        ) : undefined
                    }
                    onChange={(value, position) => {
                        setMessage(value);
                        setCaret(position);
                        if (review) clearReview();
                        setMentionFound(findMentionQuery(value, position));
                        setMentionIndex(0);
                    }}
                    onKeyDown={onKeyDown}
                    model={
                        provider && modelChoices.length > 0
                            ? {
                                  value: settings.model,
                                  choices: modelChoices,
                                  disabled: busy,
                                  onChange: value => void selectModel(value),
                              }
                            : null
                    }
                    setup={
                        <AssistantSetup
                            includeBodies={includeBodies}
                            busy={busy}
                            onIncludeBodiesChange={value =>
                                void saveSettings({ ...settings, includeBodies: value })
                            }
                            granted={chatGranted}
                            onRevoke={() => void revoke()}
                            autoApprove={autoApprove}
                            onAutoApproveChange={value => {
                                if (!settings) return;
                                // A review already on screen is no longer needed.
                                if (value && review && !review.held) clearReview();
                                void saveSettings({ ...settings, autoApprove: value });
                            }}
                            open={setupOpen}
                            onOpenChange={setSetupOpen}
                        />
                    }
                    pending={Boolean(pending)}
                    sendDisabled={sendDisabled}
                    waiting={Boolean(review || hold)}
                    onSend={() => void submit()}
                    onStop={() => stop()}
                    onCancel={() => clearReview()}
                />
            </div>
        );
    },
);
