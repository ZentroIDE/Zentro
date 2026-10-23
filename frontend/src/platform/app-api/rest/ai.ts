// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { AIAdapter } from '../contracts/ai';

function unsupported(): Promise<never> {
    return Promise.reject(new Error('The assistant runs in the desktop app'));
}

export function createAIRestAdapter(): AIAdapter {
    return withKernelResult('ai', {
        getSettings: unsupported,
        setSettings: unsupported,
        saveKey: unsupported,
        clearKey: unsupported,
        preview: unsupported,
        send: unsupported,
        listModels: unsupported,
        listMentions: unsupported,
        cancelChat: unsupported,
        revokeDataGrant: unsupported,
        createSession: unsupported,
        listSessions: unsupported,
        getSession: unsupported,
        renameSession: unsupported,
        deleteSession: unsupported,
        startMCPServer: unsupported,
        stopMCPServer: unsupported,
        getMCPStatus: unsupported,
        connectMCPClient: unsupported,
        disconnectMCPClient: unsupported,
        rotateMCPToken: unsupported,
        setMCPAutoStart: unsupported,
        listChanges: unsupported,
        getChange: unsupported,
        approveChange: unsupported,
        rejectChange: unsupported,
        resolveChatApproval: unsupported,
        listMemoryNotes: unsupported,
        addMemoryNote: unsupported,
        deleteMemoryNote: unsupported,
    });
}
