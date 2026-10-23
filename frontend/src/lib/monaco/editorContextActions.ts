// SPDX-License-Identifier: GPL-3.0-only

import { useEditorStore } from '../../stores/editorStore';
import { useEnvironmentStore } from '../../stores/environmentStore';
import { useProjectStore } from '../../stores/projectStore';
import { DOM_EVENT, TAB_TYPE } from '../constants';
import { emitCommand } from '../commandBus';

type MonacoEditorLike = {
    addAction: (descriptor: {
        id: string;
        label: string;
        contextMenuGroupId?: string;
        contextMenuOrder?: number;
        precondition?: string;
        run: () => void | Promise<void>;
    }) => { dispose: () => void };
};

interface RegisterEditorContextActionsArgs {
    editor: MonacoEditorLike;
    tabId: string;
}

function openSchemaDiffFromCurrentProject() {
    const editorStore = useEditorStore.getState();
    const project = useProjectStore.getState().activeProject;
    const activeEnvironmentKey =
        useEnvironmentStore.getState().activeEnvironmentKey ||
        project?.last_active_environment_key ||
        project?.default_environment_key;
    const selectedEnvironment = project?.environments?.find(
        environment => environment.key === activeEnvironmentKey,
    );

    const compareTabId = editorStore.addTab({
        type: TAB_TYPE.COMPARE,
        name: 'Schema Diff',
    });

    emitCommand(DOM_EVENT.OPEN_CONTEXT_SEARCH, {
        mode: 'schema-diff-source',
        targetSide: 'left',
        nextPickerSide: 'right',
        compareTabId,
        initialEnvironmentKey: selectedEnvironment?.key,
        initialSchemaName: selectedEnvironment?.last_schema || 'public',
    });
}

function buildEditorContextActionDescriptors({ tabId }: RegisterEditorContextActionsArgs) {
    return [
        {
            id: `zentro.schema-diff.${tabId}`,
            label: 'Schema Diff...',
            contextMenuGroupId: 'navigation',
            contextMenuOrder: 2.4,
            run: () => {
                openSchemaDiffFromCurrentProject();
            },
        },
    ];
}

export function registerEditorContextActions(args: RegisterEditorContextActionsArgs) {
    const disposables = buildEditorContextActionDescriptors(args).map(descriptor =>
        args.editor.addAction(descriptor),
    );
    return {
        dispose: () => {
            disposables.forEach(disposable => disposable.dispose());
        },
    };
}
