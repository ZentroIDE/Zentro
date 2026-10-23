// SPDX-License-Identifier: GPL-3.0-only

import React, { useMemo } from 'react';
import { ScrollText } from 'lucide-react';
import type { app } from '../../../../wailsjs/go/models';
import { getEnvironmentLabel } from '../../../lib/projects';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { copyAuditEntry, openAuditEntryInNewTab, pasteAuditEntry } from './logActions';
import { LogEntryRow } from './LogEntryRow';

interface Props {
    filter: app.SQLAuditFilter;
    entries: app.SQLAuditEntry[];
    environmentFilter: string;
    reload: () => void;
}

function matchesEnvironmentFilter(entry: app.SQLAuditEntry, environmentFilter: string): boolean {
    if (environmentFilter === 'all') return true;

    const normalizedFilter = (environmentFilter || '').trim().toLowerCase();
    if (!normalizedFilter) return true;

    const normalizedEnvKey = (entry.env_key || '').trim().toLowerCase();
    const normalizedEnvLabel = String(getEnvironmentLabel(entry.env_key) || '')
        .trim()
        .toLowerCase();

    return (
        normalizedEnvKey === normalizedFilter ||
        normalizedEnvLabel === normalizedFilter ||
        normalizedEnvLabel.startsWith(normalizedFilter)
    );
}

export const AuditLogView: React.FC<Props> = ({ entries, environmentFilter, reload }) => {
    const filteredEntries = useMemo(
        () =>
            environmentFilter === 'all'
                ? entries
                : entries.filter(entry => matchesEnvironmentFilter(entry, environmentFilter)),
        [entries, environmentFilter],
    );
    const pinned = useMemo(() => filteredEntries.filter(e => e.pinned), [filteredEntries]);
    const rest = useMemo(() => filteredEntries.filter(e => !e.pinned), [filteredEntries]);

    const handlePin = async (entry: app.SQLAuditEntry) => {
        await getApiGateway().audit.pinAuditEntry(entry.id, !entry.pinned);
        reload();
    };

    if (filteredEntries.length === 0) {
        return (
            <div className='flex h-full min-h-0 flex-1 flex-col items-center justify-start gap-2 overflow-y-auto px-4 py-8 text-muted-foreground text-small'>
                <ScrollText size={24} className='opacity-30' />
                <p className='m-0'>
                    {environmentFilter === 'all'
                        ? 'No audit entries yet'
                        : `No audit entries for ${environmentFilter}`}
                </p>
            </div>
        );
    }

    return (
        <div className='flex h-full min-h-0 flex-1 flex-col overflow-hidden'>
            <div className='min-h-0 flex-1 overflow-y-auto'>
                {pinned.length > 0 && (
                    <>
                        <div className='px-2.5 py-1 text-label text-muted-foreground bg-muted/50 border-b border-border'>
                            Pinned
                        </div>
                        {pinned.map(entry => (
                            <LogEntryRow
                                key={entry.id}
                                entry={entry}
                                onPaste={() => pasteAuditEntry(entry)}
                                onPin={() => handlePin(entry)}
                                onCopy={() => copyAuditEntry(entry)}
                                onOpenInNewTab={() => openAuditEntryInNewTab(entry)}
                            />
                        ))}
                        <div className='border-b border-border my-1' />
                    </>
                )}
                {rest.map(entry => (
                    <LogEntryRow
                        key={entry.id}
                        entry={entry}
                        onPaste={() => pasteAuditEntry(entry)}
                        onPin={() => handlePin(entry)}
                        onCopy={() => copyAuditEntry(entry)}
                        onOpenInNewTab={() => openAuditEntryInNewTab(entry)}
                    />
                ))}
            </div>
        </div>
    );
};
