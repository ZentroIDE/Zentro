// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { AlignLeft } from 'lucide-react';
import { SettingsClasses } from './SettingsStyles';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingField, SettingToggle } from './SettingItem';
import {
    SQL_INDENT_SIZES,
    type SqlAndOrPosition,
    type SqlCommaPosition,
    type SqlFormatSettings,
    type SqlIndentSize,
    type SqlKeywordCase,
} from '../../../lib/sqlFormatSettings';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui';

interface Props {
    value: SqlFormatSettings;
    onChange: (patch: Partial<SqlFormatSettings>) => void;
    /** The sample query formatted with the saved options; empty while loading. */
    preview: string;
}

export const SettingsFormatting: React.FC<Props> = ({ value, onChange, preview }) => (
    <div className={SettingsClasses.section}>
        <SettingsSectionHeader
            icon={AlignLeft}
            title='SQL Formatting'
            description='How Format Query lays out SQL. Applies to every connection.'
        />
        <div className={SettingsClasses.sectionContent}>
            <SettingField label='Keyword case'>
                <Select
                    value={value.keywordCase}
                    onValueChange={val => onChange({ keywordCase: val as SqlKeywordCase })}
                >
                    <SelectTrigger variant='outline'>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value='upper'>UPPERCASE</SelectItem>
                        <SelectItem value='lower'>lowercase</SelectItem>
                        <SelectItem value='preserve'>Keep as written</SelectItem>
                    </SelectContent>
                </Select>
            </SettingField>

            <SettingField
                label='Indent size'
                helperText='Spaces per level. Ignored when tabs are on.'
            >
                <Select
                    value={String(value.indentSize)}
                    onValueChange={val => onChange({ indentSize: Number(val) as SqlIndentSize })}
                >
                    <SelectTrigger variant='outline'>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {SQL_INDENT_SIZES.map(size => (
                            <SelectItem key={size} value={String(size)}>
                                {size} spaces
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </SettingField>

            <SettingToggle
                title='Indent with tabs'
                description='Use a tab character for each indent level.'
                checked={value.useTabs}
                onCheckedChange={checked => onChange({ useTabs: checked })}
            />

            <SettingField label='Comma position'>
                <Select
                    value={value.commaPosition}
                    onValueChange={val => onChange({ commaPosition: val as SqlCommaPosition })}
                >
                    <SelectTrigger variant='outline'>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value='trailing'>End of line (a,)</SelectItem>
                        <SelectItem value='leading'>Start of line (, b)</SelectItem>
                    </SelectContent>
                </Select>
            </SettingField>

            <SettingField label='AND / OR position'>
                <Select
                    value={value.andOrPosition}
                    onValueChange={val => onChange({ andOrPosition: val as SqlAndOrPosition })}
                >
                    <SelectTrigger variant='outline'>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value='leading'>Start of line</SelectItem>
                        <SelectItem value='trailing'>End of line</SelectItem>
                    </SelectContent>
                </Select>
            </SettingField>

            <SettingField label='Preview'>
                <pre className='overflow-x-auto rounded-md border border-border bg-card p-3 font-mono text-label text-foreground'>
                    {preview}
                </pre>
            </SettingField>
        </div>
    </div>
);
