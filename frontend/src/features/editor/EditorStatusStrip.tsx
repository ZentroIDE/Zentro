// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { formatSelectionInfo, type SelectionInfo } from './editorSelectionInfo';

interface EditorStatusStripProps {
    info: SelectionInfo;
}

const EditorStatusStripInner: React.FC<EditorStatusStripProps> = ({ info }) => (
    <div
        className='flex shrink-0 items-center justify-end px-2 py-0.5 text-label text-muted-foreground bg-card'
        title='Cursor position and selected characters'
    >
        <span className='tabular-nums'>{formatSelectionInfo(info)}</span>
    </div>
);

export const EditorStatusStrip = React.memo(EditorStatusStripInner);
