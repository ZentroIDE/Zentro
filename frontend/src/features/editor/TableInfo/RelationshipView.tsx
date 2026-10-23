// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { ErdView } from '../ErdView';

interface RelationshipViewProps {
    schema: string;
    table: string;
    refreshKey: number;
    isActive: boolean;
    onCountChange: (count: number | null) => void;
}

export const RelationshipView: React.FC<RelationshipViewProps> = React.memo(
    ({ schema, table, refreshKey, isActive, onCountChange }) => {
        return (
            <div className='flex-1 h-full relative flex flex-col min-h-0 bg-background'>
                <ErdView
                    schema={schema}
                    table={table}
                    refreshKey={refreshKey}
                    isActive={isActive}
                    onCountChange={onCountChange}
                />
            </div>
        );
    },
);
