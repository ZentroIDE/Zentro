// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ENVIRONMENT_KEY } from '../../lib/constants';
import { EditorToolbar } from './EditorToolbar';

const templateState = {
    loadTemplates: vi.fn(),
};

const connectionState = {
    isConnected: true,
};

const projectState = {
    activeProject: {
        default_environment_key: 'dev',
    },
};

const environmentState = {
    activeEnvironmentKey: 'dev',
};

const editorState = {
    groups: [
        {
            id: 'group-1',
            tabs: [{ id: 'tab-1', isRunning: false }],
        },
    ],
};

const statusState = {
    transactionStatus: 'none',
};

const settingsState = {
    viewMode: false,
    editorFocusMode: false,
    toggleEditorFocusMode: vi.fn(),
};

const toastState = {
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
};

vi.mock('../../stores/templateStore', () => ({
    useTemplateStore: () => templateState,
}));

vi.mock('../../stores/connectionStore', () => ({
    useConnectionStore: () => connectionState,
}));

vi.mock('../../stores/projectStore', () => ({
    useProjectStore: (selector: (state: typeof projectState) => unknown) => selector(projectState),
}));

vi.mock('../../stores/environmentStore', () => ({
    useEnvironmentStore: (selector: (state: typeof environmentState) => unknown) =>
        selector(environmentState),
}));

vi.mock('../../stores/editorStore', () => ({
    useEditorStore: (selector: (state: typeof editorState) => unknown) => selector(editorState),
}));

vi.mock('../../stores/statusStore', () => ({
    useStatusStore: (selector?: (state: typeof statusState) => unknown) =>
        selector ? selector(statusState) : statusState,
}));

vi.mock('../../stores/settingsStore', () => ({
    useSettingsStore: (selector: (state: typeof settingsState) => unknown) =>
        selector(settingsState),
}));

vi.mock('./TemplatePopover', () => ({
    TemplatePopover: () => <div>Template Popover</div>,
}));

vi.mock('../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({
        connection: {
            beginTransaction: vi.fn(),
            commitTransaction: vi.fn(),
            rollbackTransaction: vi.fn(),
        },
        query: {
            cancel: vi.fn(),
        },
    }),
}));

vi.mock('../../components/layout/Toast', () => ({
    useToast: () => toastState,
}));

describe('EditorToolbar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        projectState.activeProject.default_environment_key = ENVIRONMENT_KEY.DEVELOPMENT;
        environmentState.activeEnvironmentKey = ENVIRONMENT_KEY.DEVELOPMENT;
    });

    it('includes the full production label in execute tooltips', () => {
        environmentState.activeEnvironmentKey = ENVIRONMENT_KEY.PRODUCTION;

        render(<EditorToolbar isActive={true} tabId='tab-1' readOnly={false} />);

        expect(screen.getByTitle('Execute on Production (Ctrl+Enter)')).toBeInTheDocument();
        expect(screen.getByTitle('Explain in Production')).toBeInTheDocument();
        expect(screen.getByTitle('Explain Analyze in Production')).toBeInTheDocument();
    });

    it('uses the full staging label for execute tooltips', () => {
        environmentState.activeEnvironmentKey = ENVIRONMENT_KEY.STAGING;

        render(<EditorToolbar isActive={true} tabId='tab-1' readOnly={false} />);

        expect(screen.getByTitle('Execute on Staging (Ctrl+Enter)')).toBeInTheDocument();
    });
});
