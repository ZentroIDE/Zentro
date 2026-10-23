// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../components/ui';
import { FK_RULE_OPTIONS, type FKRule } from './TableInfo/fkUtils';

interface FKFormBodyProps {
    sourceTable: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
    sourceType?: string;
    targetType?: string;
    onDelete: FKRule;
    onUpdate: FKRule;
    onDeleteChange: (v: FKRule) => void;
    onUpdateChange: (v: FKRule) => void;
    /** When provided, renders an editable constraint name input above the relationship */
    name?: string;
    onNameChange?: (v: string) => void;
    disabled?: boolean;
    error?: string;
    /** Extra z-index class for SelectContent portals (e.g. 'z-topmost' when inside a Dialog) */
    selectContentClass?: string;
}

export const FKFormBody: React.FC<FKFormBodyProps> = ({
    sourceTable,
    sourceColumn,
    targetTable,
    targetColumn,
    sourceType,
    targetType,
    onDelete,
    onUpdate,
    onDeleteChange,
    onUpdateChange,
    name,
    onNameChange,
    disabled,
    error,
    selectContentClass,
}) => {
    const typeMismatch = sourceType && targetType && sourceType !== targetType;

    return (
        <div className='flex flex-col gap-1.5'>
            {/* Constraint name */}
            {onNameChange !== undefined && (
                <div className='flex flex-col gap-1.5'>
                    <label className='text-label font-medium text-muted-foreground'>
                        Constraint name
                    </label>
                    <Input
                        className='font-mono'
                        value={name ?? ''}
                        onChange={e => onNameChange(e.target.value)}
                        placeholder='fk_table_column'
                        disabled={disabled}
                    />
                </div>
            )}

            {/* Relationship */}
            <div className='rounded-md bg-muted/20 flex flex-col gap-1.5  text-label'>
                <span className='text-label font-medium text-muted-foreground'>Relationship</span>
                <div className='pl-3'>
                    <div className='flex items-center'>
                        <span className='text-foreground font-semibold'>{sourceTable}.</span>
                        {/* <span className='text-muted-foreground/50'>.</span> */}
                        <span className='text-success font-semibold'>{sourceColumn}</span>
                        {sourceType && (
                            <span className='text-muted-foreground/60'>({sourceType})</span>
                        )}
                    </div>
                    <span className='text-muted-foreground pl-1 text-[10px]'>↓</span>
                    <div className='flex items-center'>
                        <span className='text-foreground font-semibold'>{targetTable}.</span>
                        {/* <span className='text-muted-foreground/50'>.</span> */}
                        <span className='text-success font-semibold'>{targetColumn}</span>
                        {targetType && (
                            <span className='text-muted-foreground/60'>({targetType})</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Type mismatch warning */}
            {typeMismatch && (
                <div className='flex items-start gap-2 text-label text-warning bg-warning/10 rounded-md px-3 py-2'>
                    <AlertTriangle size={13} className='mt-0.5 shrink-0' />
                    <span>
                        Column types differ ({sourceType} vs {targetType}). Verify compatibility
                        before saving.
                    </span>
                </div>
            )}

            {/* Rules */}
            <div className='grid grid-cols-2 gap-3'>
                <div className='flex flex-col gap-1.5'>
                    <label className='text-label font-medium text-muted-foreground'>
                        On Delete
                    </label>
                    <Select
                        value={onDelete}
                        onValueChange={v => onDeleteChange(v as FKRule)}
                        disabled={disabled}
                    >
                        <SelectTrigger className='h-7 text-label font-mono'>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className={selectContentClass}>
                            {FK_RULE_OPTIONS.map(opt => (
                                <SelectItem key={opt} value={opt}>
                                    {opt}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className='flex flex-col gap-1.5'>
                    <label className='text-label font-medium text-muted-foreground'>
                        On Update
                    </label>
                    <Select
                        value={onUpdate}
                        onValueChange={v => onUpdateChange(v as FKRule)}
                        disabled={disabled}
                    >
                        <SelectTrigger className='h-7 text-label font-mono'>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent className={selectContentClass}>
                            {FK_RULE_OPTIONS.map(opt => (
                                <SelectItem key={opt} value={opt}>
                                    {opt}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Error */}
            {error && <p className='text-label text-destructive'>{error}</p>}
        </div>
    );
};
