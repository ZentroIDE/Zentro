// SPDX-License-Identifier: GPL-3.0-only

import React, { useState, useEffect, useRef } from 'react';
import {
    BookDashed,
    AlignJustify,
    Play,
    Search,
    Square,
    GitBranchPlus,
    Check,
    Undo2,
    CircleDot,
} from 'lucide-react';
import { Button, Separator } from '../../components/ui';
import { useTemplateStore } from '../../stores/templateStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useEditorStore } from '../../stores/editorStore';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { useProjectStore } from '../../stores/projectStore';
import { useStatusStore } from '../../stores/statusStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { cn } from '../../lib/cn';
import { TemplatePopover } from './TemplatePopover';
import { DOM_EVENT, ENVIRONMENT_KEY } from '../../lib/constants';
import { emitCommand } from '../../lib/commandBus';
import { getEnvironmentMeta } from '../../lib/projects';
import { getExecuteActionMeta } from '../../lib/executeActionMeta';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../shared/kernel';
import { getErrorMessage } from '../../lib/errors';
import { useToast } from '../../components/layout/Toast';
import { useShortcutHint } from '../../lib/shortcutDisplay';
import { useFocusZone } from '../../lib/focusZoneRegistry';

interface EditorToolbarProps {
    isActive?: boolean;
    tabId?: string;
    readOnly?: boolean;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({ isActive, tabId, readOnly }) => {
    const { loadTemplates } = useTemplateStore();
    const { isConnected } = useConnectionStore();
    const activeProject = useProjectStore(state => state.activeProject);
    const activeEnvironmentKey = useEnvironmentStore(state => state.activeEnvironmentKey);
    const groups = useEditorStore(state => state.groups);
    const { transactionStatus } = useStatusStore();
    const viewMode = useSettingsStore(state => state.viewMode);
    const editorFocusMode = useSettingsStore(state => state.editorFocusMode);
    const { toast } = useToast();
    const [showPopover, setShowPopover] = useState(false);
    const plusBtnRef = useRef<HTMLButtonElement>(null);
    const runBtnRef = useRef<HTMLButtonElement>(null);
    const txActive = transactionStatus === 'active';
    const formatQueryHint = useShortcutHint('editor.formatQuery');
    const focusModeHint = useShortcutHint('layout.toggleFocusMode');
    const runQueryHint = useShortcutHint('editor.runQuery');
    const cancelQueryHint = useShortcutHint('query.cancel');
    useFocusZone('editorToolbar', runBtnRef);

    const currentTab = groups.flatMap(group => group.tabs).find(tab => tab.id === tabId);
    const isRunning = currentTab?.isRunning ?? false;
    const canExecuteQueries = Boolean(isActive && isConnected);
    const canUseTemplateActions = Boolean(isActive && isConnected && !readOnly);
    const environmentKey = activeEnvironmentKey || activeProject?.default_environment_key;
    const environmentMeta = getEnvironmentMeta(environmentKey);
    const executeActionMeta = getExecuteActionMeta(environmentKey, runQueryHint);
    const executeTitleSuffix = `in ${environmentMeta.label}`;

    useEffect(() => {
        loadTemplates();
    }, []);

    const handleRun = () => {
        if (!tabId || !canExecuteQueries) return;
        emitCommand(DOM_EVENT.RUN_QUERY_ACTION, { tabId });
    };

    const handleExplain = (analyze: boolean) => {
        if (!tabId || !canExecuteQueries) return;
        emitCommand(DOM_EVENT.RUN_EXPLAIN_ACTION, { tabId, analyze });
    };

    const handleCancel = async () => {
        if (!tabId) return;
        await getApiGateway().query.cancel(tabId);
    };

    const handleBeginTransaction = async () => {
        try {
            unwrapOrThrow(await getApiGateway().connection.beginTransaction());
            toast.success('Transaction started.');
        } catch (error: unknown) {
            toast.error(`Begin transaction failed: ${getErrorMessage(error)}`);
        }
    };

    const handleCommitTransaction = async () => {
        try {
            unwrapOrThrow(await getApiGateway().connection.commitTransaction());
            toast.success('Transaction committed.');
        } catch (error: unknown) {
            toast.error(`Commit failed: ${getErrorMessage(error)}`);
        }
    };

    const handleRollbackTransaction = async () => {
        try {
            unwrapOrThrow(await getApiGateway().connection.rollbackTransaction());
            toast.success('Transaction rolled back.');
        } catch (error: unknown) {
            toast.error(`Rollback failed: ${getErrorMessage(error)}`);
        }
    };

    return (
        // This strip is glued to the editor's edge, so it must sit on the exact
        // surface Monaco paints (editor.background ≈ --surface-app) in every
        // preset. bg-card/bg-background diverge from it in dark presets and
        // pick up the env-tint wash Monaco never sees.
        <div
            data-zone='editorToolbar'
            className='flex flex-col w-9 h-full shrink-0 select-none items-center gap-2 overflow-y-auto bg-(--surface-app) p-1 rounded-l-md'
        >
            <div className='flex flex-col items-center gap-1'>
                <Button
                    ref={runBtnRef}
                    variant={executeActionMeta.variant}
                    tone={executeActionMeta.tone}
                    size='icon'
                    disabled={!canExecuteQueries || isRunning}
                    title={executeActionMeta.title}
                    aria-label={executeActionMeta.ariaLabel}
                    onClick={handleRun}
                >
                    <Play size={16} />
                </Button>
                <Button
                    variant='ghost'
                    tone={environmentKey === ENVIRONMENT_KEY.PRODUCTION ? 'destructive' : 'default'}
                    size='icon'
                    disabled={!canExecuteQueries || isRunning}
                    title={`Explain ${executeTitleSuffix}`}
                    aria-label={`Explain ${executeTitleSuffix}`}
                    onClick={() => handleExplain(false)}
                >
                    <Search size={14} />
                </Button>
                <Button
                    variant='ghost'
                    tone={environmentKey === ENVIRONMENT_KEY.PRODUCTION ? 'destructive' : 'default'}
                    size='icon'
                    disabled={!canExecuteQueries || isRunning}
                    title={`Explain Analyze ${executeTitleSuffix}`}
                    aria-label={`Explain Analyze ${executeTitleSuffix}`}
                    onClick={() => handleExplain(true)}
                >
                    <Search size={14} className='text-accent' />
                </Button>
                <Button
                    variant='ghost'
                    size='icon'
                    disabled={!isRunning || !isActive}
                    title={`Cancel Execution (${cancelQueryHint})`}
                    onClick={handleCancel}
                >
                    <Square
                        size={16}
                        fill={isRunning && isActive ? 'currentColor' : 'none'}
                        color={isRunning && isActive ? 'var(--status-destructive)' : 'currentColor'}
                    />
                </Button>
            </div>

            <Separator orientation='horizontal' className='w-5' />

            <div className='flex flex-col items-center gap-1'>
                <Button
                    variant='ghost'
                    size='icon'
                    disabled={!isConnected || txActive || !isActive || viewMode}
                    title='Begin Transaction'
                    onClick={handleBeginTransaction}
                >
                    <GitBranchPlus
                        size={14}
                        color={
                            !isConnected || txActive || !isActive || viewMode
                                ? 'currentColor'
                                : 'var(--status-success)'
                        }
                    />
                </Button>
                <Button
                    variant='ghost'
                    size='icon'
                    disabled={!isConnected || !txActive || !isActive || viewMode}
                    title='Rollback Transaction'
                    onClick={handleRollbackTransaction}
                >
                    <Undo2
                        size={14}
                        color={
                            !isConnected || !txActive || !isActive || viewMode
                                ? 'currentColor'
                                : 'var(--status-destructive)'
                        }
                    />
                </Button>
                <Button
                    variant='ghost'
                    size='icon'
                    disabled={!isConnected || !txActive || !isActive || viewMode}
                    title='Commit Transaction'
                    onClick={handleCommitTransaction}
                >
                    <Check
                        size={14}
                        color={
                            !isConnected || !txActive || !isActive || viewMode
                                ? 'currentColor'
                                : 'var(--interactive-primary)'
                        }
                    />
                </Button>
            </div>

            <Separator orientation='horizontal' className='w-5' />

            <div className='flex flex-col items-center gap-1'>
                <Button
                    variant='ghost'
                    size='icon'
                    className='ui-interactive-ghost-success'
                    title={`Format Query (${formatQueryHint})`}
                    onClick={() => {
                        if (!isActive) return;
                        emitCommand(DOM_EVENT.FORMAT_QUERY_ACTION);
                    }}
                >
                    <AlignJustify size={14} />
                </Button>
                <Button
                    ref={plusBtnRef}
                    variant='ghost'
                    size='icon'
                    className={cn(
                        'ui-interactive-ghost-success',
                        showPopover && 'bg-success/20 text-success',
                    )}
                    onClick={() => setShowPopover(!showPopover)}
                    title='Manage Templates'
                >
                    <BookDashed size={14} />
                </Button>
                <Button
                    variant='ghost'
                    size='icon'
                    aria-pressed={editorFocusMode}
                    className={cn(editorFocusMode && 'text-accent')}
                    onClick={() => useSettingsStore.getState().toggleEditorFocusMode()}
                    title={`Focus Mode (${focusModeHint})`}
                >
                    <CircleDot size={14} />
                </Button>
            </div>

            {showPopover && (
                <TemplatePopover
                    onClose={() => setShowPopover(false)}
                    anchorRect={plusBtnRef.current?.getBoundingClientRect() || null}
                    tabId={tabId}
                    isActive={isActive}
                    readOnly={!canUseTemplateActions}
                />
            )}
        </div>
    );
};
