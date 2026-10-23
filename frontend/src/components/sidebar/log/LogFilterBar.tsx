// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Trash2, Download } from 'lucide-react';
import type { app } from '../../../../wailsjs/go/models';
import { ENVIRONMENT_KEYS, getEnvironmentLabel } from '../../../lib/projects';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import {
    Input,
    Button,
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
} from '../../ui';

interface Props {
    filter: app.SQLAuditFilter;
    environmentFilter: string;
    onChange: (f: Partial<app.SQLAuditFilter>) => void;
    onEnvironmentChange: (value: string) => void;
    onReload: () => void;
    activeView: 'audit' | 'realtime' | 'debug';
}

export const LogFilterBar: React.FC<Props> = ({
    filter,
    environmentFilter,
    onChange,
    onEnvironmentChange,
    onReload,
    activeView,
}) => {
    const handleClear = async () => {
        await getApiGateway().audit.clearSQLAuditLog();
        onReload();
    };

    const handleExport = async (format: string) => {
        await getApiGateway().audit.exportSQLAuditLog(format);
    };

    if (activeView !== 'audit') return null;

    return (
        <div className='flex items-center gap-1 py-1 shrink-0'>
            <div className='flex-1 min-w-0'>
                <Input
                    size='sm'
                    className='w-full px-2'
                    placeholder='Filter audit log...'
                    value={filter.search}
                    onChange={e => onChange({ search: e.target.value })}
                    onKeyDown={e => {
                        if (e.key === 'Escape') onChange({ search: '' });
                    }}
                />
            </div>
            <Select
                value={filter.status || 'all'}
                onValueChange={val => onChange({ status: val === 'all' ? '' : val })}
            >
                <SelectTrigger size='sm' className='w-24 shrink-0' aria-label='Status filter'>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value='all'>All</SelectItem>
                    <SelectItem value='success'>Success</SelectItem>
                    <SelectItem value='error'>Error</SelectItem>
                </SelectContent>
            </Select>
            <Select value={environmentFilter} onValueChange={onEnvironmentChange}>
                <SelectTrigger size='sm' className='w-32 shrink-0' aria-label='Environment filter'>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value='all'>All envs</SelectItem>
                    {ENVIRONMENT_KEYS.map(key => (
                        <SelectItem key={key} value={key}>
                            {getEnvironmentLabel(key)}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Button
                type='button'
                variant='ghost'
                size='micro'
                title='Export as JSON'
                onClick={() => handleExport('json')}
            >
                <Download size={12} />
            </Button>
            <Button
                type='button'
                variant='ghost'
                size='micro'
                className='ui-interactive-ghost-destructive'
                title='Clear audit log'
                onClick={handleClear}
            >
                <Trash2 size={12} />
            </Button>
        </div>
    );
};
