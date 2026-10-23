// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Copy, FilePlus } from 'lucide-react';
import { Button } from '../../components/ui';

interface ScriptPreviewActionsProps {
    onCopy?: (() => void) | null;
    onOpenInNewTab?: (() => void) | null;
}

export const ScriptPreviewActions: React.FC<ScriptPreviewActionsProps> = ({
    onCopy,
    onOpenInNewTab,
}) => {
    if (!onCopy && !onOpenInNewTab) return null;

    return (
        <>
            {onCopy ? (
                <Button variant='ghost' size='icon' onClick={onCopy} title='Copy Script'>
                    <Copy size={14} />
                </Button>
            ) : null}
            {onOpenInNewTab ? (
                <Button
                    variant='ghost'
                    size='icon'
                    onClick={onOpenInNewTab}
                    title='Open in New Tab'
                >
                    <FilePlus size={14} />
                </Button>
            ) : null}
        </>
    );
};
