// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { cn } from '../../lib/cn';
import { DRIVER } from '../../lib/constants';
import { getProvider, PROVIDERS } from '../../lib/providers';
import type { UseConnectionFormReturn } from '../../hooks/useConnectionForm';
import { Button, Select, SelectContent, SelectItem, SelectTrigger } from '../ui';
import { interactiveSelected } from '../ui/contract';
import { ConnectionForm } from './ConnectionForm';
import { useConnectionFormTour } from '../../features/onboarding/useConnectionFormTour';

interface ConnectionEditorPanelProps {
    form: UseConnectionFormReturn;
    /** Extra content above the form (e.g. the edit-mode credentials warning). */
    banner?: React.ReactNode;
    showUriField?: boolean;
    onCancel: () => void;
}

/**
 * The connection editor: a provider identity column on the left, the
 * credentials {@link ConnectionForm} on the right. "Change provider" opens a
 * dropdown of every driver; a saved connection's driver can't change, so the
 * control is disabled in edit mode.
 */
export const ConnectionEditorPanel: React.FC<ConnectionEditorPanelProps> = ({
    form,
    banner,
    showUriField,
    onCancel,
}) => {
    const selectedDriver = form.selectedProvider || DRIVER.POSTGRES;
    const provider = getProvider(selectedDriver);

    useConnectionFormTour({ enabled: !form.isEditing });

    return (
        <div className='flex min-h-0 flex-1 overflow-hidden'>
            <div
                className='flex w-2/5 shrink-0 flex-col items-center justify-center gap-1 px-4 py-8 text-center'
                data-tour='connection-provider'
            >
                <Select
                    value={selectedDriver}
                    onValueChange={form.handleDriverChange}
                    disabled={form.isEditing}
                >
                    <SelectTrigger asChild aria-label='Change provider'>
                        <Button
                            type='button'
                            variant='ghost'
                            title={form.isEditing ? provider.label : 'Change provider'}
                            className='mb-2 size-20! rounded-xl border-transparent p-0 hover:brightness-95'
                            style={{ background: `${provider.color}14` }}
                        >
                            <img
                                src={provider.icon}
                                alt=''
                                className='h-12 w-12 object-contain drop-shadow-sm'
                            />
                        </Button>
                    </SelectTrigger>
                    <SelectContent className='z-topmost min-w-56'>
                        {PROVIDERS.map(p => (
                            <SelectItem
                                key={p.key}
                                value={p.key}
                                textValue={p.label}
                                className={cn(
                                    'h-auto py-1.5 pr-2 [&>span:first-child]:hidden',
                                    p.key === selectedDriver && interactiveSelected,
                                )}
                            >
                                <span className='flex items-center gap-2'>
                                    <img
                                        src={p.icon}
                                        alt=''
                                        className='h-8 w-8 shrink-0 object-contain'
                                    />
                                    <span className='flex flex-col text-left'>
                                        <span className='text-small text-foreground'>
                                            {p.label}
                                        </span>
                                        <span className='text-label text-muted-foreground'>
                                            {p.description}
                                        </span>
                                    </span>
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <div className='text-small font-semibold text-foreground'>{provider.label}</div>
                <div className='text-label text-muted-foreground'>{provider.description}</div>
            </div>

            <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
                {banner}
                <ConnectionForm
                    formData={form.formData}
                    connString={form.connString}
                    testing={form.testing}
                    saving={form.saving}
                    testResult={form.testResult}
                    errorMsg={form.errorMsg}
                    successMsg={form.successMsg}
                    isEditing={form.isEditing}
                    showUriField={showUriField ?? !form.isEditing}
                    onChange={form.handleChange}
                    onConnStringChange={form.handleParseConnectionString}
                    onTest={form.handleTest}
                    onSave={form.handleSave}
                    onCancel={onCancel}
                />
            </div>
        </div>
    );
};
