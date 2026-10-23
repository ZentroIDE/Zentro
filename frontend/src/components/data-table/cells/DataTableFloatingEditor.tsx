// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Textarea } from '../../ui';
import { useCellEditor } from '../../../hooks/useCellEditor';

interface DataTableFloatingEditorProps {
    value: string;
    className?: string;
    readonlySuffix?: string;
    onChange: (value: string) => void;
    onCommit: (options?: { nextDirection?: 1 | -1 }) => Promise<void>;
    onCancel: () => void;
    onSaveShortcut: () => void;
    title?: string;
}

export const DataTableFloatingEditor: React.FC<DataTableFloatingEditorProps> = ({
    value,
    className,
    readonlySuffix,
    onChange,
    onCommit,
    onCancel,
    onSaveShortcut,
    title,
}) => {
    const { textareaRef, handleKeyDown, handleBlur } = useCellEditor({
        value,
        onCommit: () => onCommit(),
        onCancel,
        onSaveShortcut,
        onTabMove: direction => onCommit({ nextDirection: direction }),
    });

    return (
        <div className='rt-floating-editor-anchor'>
            <div className='rt-cell-content rt-cell-content--compact rt-floating-editor-placeholder'>
                {value || ' '}
            </div>
            <Textarea
                ref={textareaRef}
                value={value}
                rows={1}
                title={title}
                className={className}
                onChange={event => onChange(event.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                onClick={event => event.stopPropagation()}
            />
            {readonlySuffix && (
                <div className='rt-floating-editor-suffix' aria-hidden='true'>
                    {readonlySuffix}
                </div>
            )}
        </div>
    );
};
