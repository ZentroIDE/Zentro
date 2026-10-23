// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui';
import { cn } from '../../lib/cn';

interface EditorSchemaSelectProps {
    availableSchemas: string[];
    canChangeSchema: boolean;
    currentSchema: string;
    onSchemaChange: (value: string) => void | Promise<void>;
    className?: string;
    // Accepted for API compatibility with the toolbar call site. The
    // trigger always sits on the toolbar's dark/tinted active-environment
    // zone, so its label is rendered white regardless of environment
    // rather than tinted per env.
    env?: string | null;
    loading?: boolean;
}

export const EditorSchemaSelect: React.FC<EditorSchemaSelectProps> = ({
    availableSchemas,
    canChangeSchema,
    currentSchema,
    onSchemaChange,
    className,
    loading = false,
}) => {
    return (
        <div className={cn('min-w-0 shrink-0 flex items-center', className)}>
            <Select
                value={currentSchema || undefined}
                onValueChange={value => void onSchemaChange(value)}
                disabled={!canChangeSchema || loading || availableSchemas.length === 0}
            >
                <SelectTrigger
                    aria-label='Select schema context'
                    title='Schema context used for query execution fallback'
                    className={cn(
                        'h-7 w-auto shrink-0 border-none bg-transparent! shadow-none px-1.5 focus:ring-0 outline-none rounded-md',
                        // Always white: the toolbar's active-environment zone
                        // is dark/tinted in every theme, so a themed text
                        // color would read as washed out here.
                        'text-white! data-placeholder:text-white!',
                    )}
                >
                    <SelectValue
                        placeholder={loading ? 'Loading schemas...' : 'Schema'}
                        className='text-white!'
                    />
                </SelectTrigger>
                <SelectContent>
                    {availableSchemas.map(schemaName => (
                        <SelectItem key={schemaName} value={schemaName}>
                            {schemaName}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
};
