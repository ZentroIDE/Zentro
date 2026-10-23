// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { useSettingsStore } from '../../stores/settingsStore';
import type { Tab } from '../../stores/editorStore';
import { useMonacoTheme } from '../../lib/theme';

interface GitDiffViewProps {
    tab: Tab;
}

export const GitDiffView: React.FC<GitDiffViewProps> = ({ tab }) => {
    const { theme } = useSettingsStore();
    const monacoTheme = useMonacoTheme(theme);

    return (
        <DiffEditor
            original={tab.gitDiffBefore ?? ''}
            modified={tab.gitDiffAfter ?? ''}
            language='sql'
            theme={monacoTheme}
            options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                fontSize: 13,
                renderOverviewRuler: false,
                renderSideBySide: true,
            }}
        />
    );
};
