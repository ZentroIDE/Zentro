// SPDX-License-Identifier: GPL-3.0-only

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { useAISettingsStore } from '../../stores/aiSettingsStore';
import { useAIChatStore } from '../../stores/aiChatStore';
import { useEditorStore } from '../../stores/editorStore';
import { createQueryTab } from '../../lib/tabFactory';
import { FEATURE } from '../../lib/license/entitlementMatrix';
import { useFeatureGate } from '../../lib/license/useFeatureGate';
import { requestRunWhenReady } from '../../lib/pendingRun';
import { getExecuteActionMeta } from '../../lib/executeActionMeta';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { useSidebarSideState } from '../../stores/sidebarUiStore';
import { activeAIProvider } from '../../lib/aiAssistant';
import { ChatHistoryPopover } from '../../components/layout/ChatHistoryPopover';
import { AssistantMessages } from './AssistantMessages';
import { AssistantInput, type AssistantInputHandle } from './AssistantInput';
import { AssistantRowApproval } from './AssistantRowApproval';

// AssistantPanel is the header and the frame. The conversation and the message
// box are separate components that read the stores themselves, so typing in the
// box renders the box and nothing else.
export function AssistantPanel() {
    const gate = useFeatureGate();
    const canUse = gate.canUse(FEATURE.QUERY_ADVANCED_AI_ASSIST);
    const environmentKey = useEnvironmentStore(state => state.activeEnvironmentKey);
    const addTab = useEditorStore(state => state.addTab);
    const runLabel = getExecuteActionMeta(environmentKey).actionLabel;

    const assistantOpen = useSidebarSideState('secondary').activePanelId === 'assistant';
    const settings = useAISettingsStore(state => state.settings);
    const storeError = useAISettingsStore(state => state.error);
    const storeBusy = useAISettingsStore(state => state.busy);
    const load = useAISettingsStore(state => state.load);
    const saveSettings = useAISettingsStore(state => state.save);

    const session = useAIChatStore(state => state.session);
    const sessions = useAIChatStore(state => state.sessions);
    const chatBusy = useAIChatStore(state => state.busy);
    const loadSessions = useAIChatStore(state => state.loadSessions);
    const loadMentions = useAIChatStore(state => state.loadMentions);
    const newSession = useAIChatStore(state => state.newSession);
    const openSession = useAIChatStore(state => state.openSession);
    const renameSession = useAIChatStore(state => state.renameSession);
    const deleteSession = useAIChatStore(state => state.deleteSession);

    const [editingTitle, setEditingTitle] = useState<string | null>(null);
    const inputHandle = useRef<AssistantInputHandle>(null);

    useEffect(() => {
        if (!canUse) return;
        void load({ auto: true });
    }, [assistantOpen, canUse, load]);

    useEffect(() => {
        if (!canUse || !assistantOpen) return;
        void loadSessions();
        void loadMentions();
    }, [assistantOpen, canUse, loadSessions, loadMentions]);

    // These two are handed to the conversation, which only re-renders when its own
    // data changes, so they must keep their identity between renders.
    const openSql = useCallback(
        (sql: string, run: boolean) => {
            const tabId = addTab(createQueryTab('Assistant', `${sql}\n-- AI-generated, verify`));
            // The new tab's editor is not mounted yet, so a run command sent now
            // would be lost; the editor runs the query when it is ready.
            if (run) requestRunWhenReady(tabId);
        },
        [addTab],
    );
    const fillMessage = useCallback((text: string) => inputHandle.current?.fill(text), []);

    if (!canUse) {
        return (
            <p className='p-3 text-label text-muted-foreground'>
                The assistant is turned off for this installation.
            </p>
        );
    }

    if (!settings) {
        return (
            <p className='p-3 text-label text-muted-foreground'>
                {storeError || 'Loading assistant…'}
            </p>
        );
    }

    const provider = activeAIProvider(settings);
    const busy = chatBusy || storeBusy;
    const title = session?.title ?? 'New chat';

    const hint = settings.connectionDisabled
        ? 'The assistant is off for this connection.'
        : !provider
          ? 'Open chat setup (bottom left) to choose Codex or DeepSeek and add its key.'
          : !provider.hasKey
            ? `Open chat setup to add the ${provider.label} key and test it.`
            : !settings.model
              ? 'Open chat setup and press Test to load the models.'
              : null;

    const commitTitle = () => {
        const next = editingTitle?.trim() ?? '';
        setEditingTitle(null);
        if (session && next && next !== session.title) {
            void renameSession(session.id, next);
        }
    };

    return (
        <div
            data-zone='assistant'
            className='flex h-full min-h-0 select-text flex-col'
            onPointerEnter={() => void load()}
        >
            <div className='flex items-center gap-1 border-b border-border px-2 py-1.5'>
                {editingTitle !== null ? (
                    <Input
                        autoFocus
                        aria-label='Chat title'
                        value={editingTitle}
                        className='min-w-0 flex-1'
                        onChange={event => setEditingTitle(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Enter') commitTitle();
                            if (event.key === 'Escape') setEditingTitle(null);
                        }}
                        onBlur={commitTitle}
                    />
                ) : (
                    <Button
                        type='button'
                        variant='ghost'
                        className='min-w-0 flex-1 justify-start truncate font-medium'
                        title='Rename chat'
                        disabled={!session}
                        onClick={() => setEditingTitle(title)}
                    >
                        {title}
                    </Button>
                )}
                <Button
                    type='button'
                    size='icon'
                    variant='ghost'
                    aria-label='New chat'
                    title='New chat'
                    disabled={busy}
                    onClick={() => void newSession()}
                >
                    <Plus className='size-3.5' aria-hidden />
                </Button>
                <ChatHistoryPopover
                    sessions={sessions}
                    currentId={session?.id ?? null}
                    disabled={busy}
                    onOpen={id => void openSession(id)}
                    onNew={() => void newSession()}
                    onRename={(id, next) => void renameSession(id, next)}
                    onDelete={id => void deleteSession(id)}
                />
            </div>

            {settings?.dataPolicyNotice && (
                <div
                    role='status'
                    className='flex items-start justify-between gap-2 border-b border-border px-4 py-2'
                >
                    <p className='text-label text-muted-foreground'>
                        The assistant now sees your schema only, never rows. To let it read a few
                        rows, turn on Data mode in Settings &gt; Assistant. Each sample is shown to
                        you before it is sent.
                    </p>
                    <Button
                        type='button'
                        variant='ghost'
                        onClick={() => void saveSettings({ ...settings })}
                    >
                        Got it
                    </Button>
                </div>
            )}
            <AssistantMessages
                hint={hint}
                runLabel={runLabel}
                onOpenSql={openSql}
                onPickSuggestion={fillMessage}
            />
            <AssistantInput ref={inputHandle} />
            <AssistantRowApproval />
        </div>
    );
}
