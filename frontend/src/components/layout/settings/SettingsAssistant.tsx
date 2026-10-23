// SPDX-License-Identifier: GPL-3.0-only

import React, { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import {
    Badge,
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../ui';
import { SettingsClasses } from './SettingsStyles';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingAction, SettingField, SettingGroupTitle, SettingToggle } from './SettingItem';
import { activeAIProvider, chatProviders, type AIProviderStatus } from '../../../lib/aiAssistant';
import { SettingsMCPServer } from './SettingsMCPServer';
import { SettingsAssistantMemory } from './SettingsAssistantMemory';
import type { AssistantSettingsModel } from './useAssistantSettings';
import type { MCPServerSettingsModel } from './useMCPServerSettings';

function providerState(provider: AIProviderStatus): string {
    if (!provider.hasKey) return 'No key yet';
    if (provider.models.length === 0)
        return `Key ${provider.keyHint} saved. Press Test to load the models.`;
    return `Key ${provider.keyHint} saved · ${provider.models.length} models`;
}

// SettingsAssistant follows docs/rules/settings-ui.md: flat rows, no cards,
// groups named by SettingGroupTitle.
interface SettingsAssistantProps {
    model: AssistantSettingsModel;
    mcp: MCPServerSettingsModel;
}

// SettingsAssistant only draws: the stores are wired in useAssistantSettings
// and useMCPServerSettings, which SettingsView calls.
export function SettingsAssistant({ model, mcp }: SettingsAssistantProps) {
    const { settings, error, status, busy } = model;
    // The key draft stays here so it never reaches the shared store.
    const [draft, setDraft] = useState('');

    if (!settings) {
        return (
            <div className={SettingsClasses.section}>
                <SettingsSectionHeader
                    icon={MessageSquare}
                    title='Assistant'
                    description={error || 'Loading assistant…'}
                />
            </div>
        );
    }

    // Production no longer forces a local model (ADR 0017); only airgap does.
    const cloudLocked = settings.airgap;
    const providers = chatProviders(settings);
    const provider = activeAIProvider(settings);
    const choices = provider
        ? Array.from(new Set([...provider.models, settings.model].filter(Boolean)))
        : [];

    return (
        <div className={SettingsClasses.section}>
            <SettingsSectionHeader
                icon={MessageSquare}
                title='Assistant'
                description='Chat about this database with a model you choose. Keys stay in the OS keyring. The model reads structure only, never rows, unless you turn on Data mode.'
            />
            <div className={SettingsClasses.sectionContent}>
                <SettingToggle
                    title='Enable for this project'
                    description='Off until you turn it on. SQL opens in a new tab and you run it.'
                    checked={settings.enabled}
                    disabled={busy}
                    ariaLabel='Enable assistant for this project'
                    onCheckedChange={checked => model.setEnabled(Boolean(checked))}
                />
                <SettingToggle
                    title='Off for this connection'
                    description='Keeps this connection out of chat while the project assistant is on.'
                    checked={settings.connectionDisabled}
                    disabled={busy || !model.hasConnection}
                    ariaLabel='Turn the assistant off for this connection'
                    onCheckedChange={checked => model.setConnectionDisabled(Boolean(checked))}
                />

                <SettingGroupTitle title='Model' />
                {cloudLocked && (
                    <p className='text-label text-muted-foreground'>
                        This license keeps the assistant on this computer.
                    </p>
                )}
                <SettingField label='Provider'>
                    <div role='group' aria-label='Provider' className='flex gap-1'>
                        {providers.map(item => (
                            <Button
                                key={item.id}
                                type='button'
                                variant={item.active ? 'default' : 'outline'}
                                aria-pressed={item.active}
                                disabled={busy || cloudLocked}
                                onClick={() => {
                                    if (!item.active) model.selectProvider(item.id);
                                }}
                            >
                                {item.label}
                            </Button>
                        ))}
                    </div>
                </SettingField>
                {provider && !cloudLocked && (
                    <>
                        <SettingField label='API key' helperText={providerState(provider)}>
                            <div className='flex gap-1.5'>
                                <Input
                                    type='password'
                                    value={draft}
                                    placeholder={
                                        provider.hasKey
                                            ? 'Paste a new key to replace the saved one'
                                            : `${provider.label} API key`
                                    }
                                    aria-label={`${provider.label} API key`}
                                    onChange={event => setDraft(event.target.value)}
                                />
                                <Button
                                    type='button'
                                    disabled={busy || (draft.trim() === '' && !provider.hasKey)}
                                    onClick={() => {
                                        void model.testKey(provider.host, draft).then(ok => {
                                            if (ok) setDraft('');
                                        });
                                    }}
                                >
                                    Test
                                </Button>
                                <Button
                                    type='button'
                                    variant='ghost'
                                    tone='destructive'
                                    disabled={busy || !provider.hasKey}
                                    onClick={() => model.clearKey(provider.host)}
                                >
                                    Clear
                                </Button>
                            </div>
                        </SettingField>
                        {choices.length > 0 && (
                            <SettingField label='Model'>
                                <Select
                                    value={settings.model}
                                    disabled={busy}
                                    onValueChange={value => model.selectModel(value)}
                                >
                                    <SelectTrigger aria-label={`${provider.label} model`}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {choices.map(id => (
                                            <SelectItem key={id} value={id}>
                                                {id}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </SettingField>
                        )}
                    </>
                )}

                <SettingGroupTitle
                    title='What it can read'
                    description='Structure always. Anything more is off until you allow it.'
                />
                <SettingToggle
                    title='View, routine and script text'
                    description='Literal values are replaced first.'
                    checked={settings.includeBodies}
                    disabled={busy}
                    ariaLabel='Include view, routine and script text'
                    onCheckedChange={checked => model.setIncludeBodies(Boolean(checked))}
                />
                <SettingToggle
                    title='Connection details'
                    description='Host, port and user name for MCP agents. Never the password.'
                    checked={settings.includeConnectionDetails}
                    disabled={busy}
                    ariaLabel='Include connection details'
                    onCheckedChange={checked => model.setIncludeConnectionDetails(Boolean(checked))}
                />
                <SettingToggle
                    title='Count rows'
                    description='How many rows a change touches. Counts only, never values.'
                    checked={settings.allowReadData}
                    disabled={busy}
                    ariaLabel='Let the agent count rows'
                    onCheckedChange={checked => model.setAllowReadData(Boolean(checked))}
                />
                <SettingToggle
                    title='Data mode'
                    description='Up to 10 rows per question. A cloud model or Production shows you the rows first.'
                    checked={settings.dataMode}
                    disabled={busy}
                    ariaLabel='Data mode'
                    onCheckedChange={checked => model.setDataMode(Boolean(checked))}
                />
                <SettingToggle
                    title='Run history'
                    description='When queries ran and how long. Never the SQL or errors.'
                    checked={settings.allowAudit}
                    disabled={busy}
                    ariaLabel='Let the agent read the run history'
                    onCheckedChange={checked => model.setAllowAudit(Boolean(checked))}
                />

                <SettingGroupTitle
                    title='What it can do'
                    description='Nothing runs until you approve it in Zentro.'
                />
                <SettingToggle
                    title='Propose changes'
                    description='It may write SQL for you to review. It never runs it.'
                    checked={settings.allowChanges}
                    disabled={busy}
                    ariaLabel='Let the agent propose changes'
                    onCheckedChange={checked => model.setAllowChanges(Boolean(checked))}
                />
                <div className='pl-4'>
                    <SettingToggle
                        title='On Production too'
                        description='Lets it propose a write for a Production connection.'
                        checked={settings.allowProduction}
                        disabled={busy || !settings.allowChanges}
                        ariaLabel='Allow the agent on Production'
                        onCheckedChange={checked => model.setAllowProduction(Boolean(checked))}
                    />
                </div>

                <SettingsAssistantMemory connectionId={model.connectionId} />

                {status && <p className='text-label text-muted-foreground'>{status}</p>}
                {error && <p className='text-label text-destructive'>{error}</p>}

                <SettingsMCPServer {...mcp} />
            </div>
        </div>
    );
}
