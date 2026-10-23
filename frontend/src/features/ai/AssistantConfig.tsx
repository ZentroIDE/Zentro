// SPDX-License-Identifier: GPL-3.0-only

import React, { useState } from 'react';
import { Button, Input } from '../../components/ui';
import { useAISettingsStore } from '../../stores/aiSettingsStore';
import { activeAIProvider, chatProviders } from '../../lib/aiAssistant';

// AssistantConfig is the provider and key block inside the setup popover. It
// reads and writes the same store as Settings > Assistant.
export function AssistantConfig() {
    const settings = useAISettingsStore(state => state.settings);
    const error = useAISettingsStore(state => state.error);
    const status = useAISettingsStore(state => state.status);
    const busy = useAISettingsStore(state => state.busy);
    const selectProvider = useAISettingsStore(state => state.selectProvider);
    const testProvider = useAISettingsStore(state => state.testProvider);
    const clearKey = useAISettingsStore(state => state.clearKey);
    const [draft, setDraft] = useState('');

    if (!settings) return null;

    const providers = chatProviders(settings);
    const provider = activeAIProvider(settings);
    // Production no longer forces a local model (ADR 0017); only airgap does.
    const cloudLocked = settings.airgap;

    return (
        <div className='flex flex-col gap-3 p-3'>
            <div className='flex flex-col gap-1.5'>
                <p className='text-label text-muted-foreground'>Provider</p>
                <div role='group' aria-label='Chat provider' className='flex gap-1'>
                    {providers.map(item => (
                        <Button
                            key={item.id}
                            type='button'
                            variant={item.id === provider?.id ? 'default' : 'outline'}
                            aria-pressed={item.id === provider?.id}
                            disabled={busy || cloudLocked}
                            className='flex-1'
                            onClick={() => void selectProvider(item.id)}
                        >
                            {item.label}
                        </Button>
                    ))}
                </div>
            </div>

            {cloudLocked && (
                <p className='text-label text-muted-foreground'>
                    This license keeps the assistant on this computer.
                </p>
            )}

            {provider && !cloudLocked && (
                <div className='flex flex-col gap-1.5'>
                    <p className='text-label text-muted-foreground'>API key</p>
                    <div className='flex gap-1.5'>
                        <Input
                            type='password'
                            value={draft}
                            placeholder={
                                provider.hasKey
                                    ? `Saved ${provider.keyHint}. Paste to replace`
                                    : `${provider.label} API key`
                            }
                            aria-label={`${provider.label} API key`}
                            onChange={event => setDraft(event.target.value)}
                        />
                        <Button
                            type='button'
                            variant='outline'
                            disabled={busy || (draft.trim() === '' && !provider.hasKey)}
                            onClick={() => {
                                void testProvider(provider.host, draft).then(() => {
                                    if (!useAISettingsStore.getState().error) setDraft('');
                                });
                            }}
                        >
                            Test
                        </Button>
                    </div>
                    <div className='flex items-center justify-between gap-2'>
                        <p className='text-label text-muted-foreground'>
                            {provider.hasKey
                                ? `Saved in the OS keyring · ${provider.models.length} models loaded`
                                : 'Paste the key, then Test. It is stored in the OS keyring.'}
                        </p>
                        {provider.hasKey && (
                            <Button
                                type='button'
                                size='micro'
                                variant='ghost'
                                disabled={busy}
                                onClick={() => void clearKey(provider.host)}
                            >
                                Clear key
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {status && <p className='text-label text-muted-foreground'>{status}</p>}
            {error && <p className='text-label text-destructive'>{error}</p>}
        </div>
    );
}
