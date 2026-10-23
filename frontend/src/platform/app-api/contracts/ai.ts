// SPDX-License-Identifier: GPL-3.0-only

import type { KernelResult } from '../../../shared/kernel';
import type {
    AIPreview,
    AIPreviewRequest,
    AISendRequest,
    AISendResult,
    AISession,
    AISessionSummary,
    AISettingsView,
    AIModelCatalog,
    AIMentionCatalog,
    AIMCPStatus,
    AIMCPClient,
    AIMCPClientResult,
    ProjectAISettings,
    AIChangeProposal,
    AIChangeApproveRequest,
    AIMemoryNote,
} from '../../../lib/aiAssistant';

export interface AIAdapter {
    getSettings(): Promise<KernelResult<AISettingsView>>;
    setSettings(settings: ProjectAISettings): Promise<KernelResult<AISettingsView>>;
    saveKey(secret: string, host: string): Promise<KernelResult<AISettingsView>>;
    clearKey(host: string): Promise<KernelResult<AISettingsView>>;
    preview(request: AIPreviewRequest): Promise<KernelResult<AIPreview>>;
    send(request: AISendRequest): Promise<KernelResult<AISendResult>>;
    listModels(host: string): Promise<KernelResult<AIModelCatalog>>;
    listMentions(): Promise<KernelResult<AIMentionCatalog>>;
    cancelChat(requestId: string): Promise<KernelResult<void>>;
    revokeDataGrant(sessionId: string): Promise<KernelResult<void>>;
    createSession(): Promise<KernelResult<AISession>>;
    listSessions(): Promise<KernelResult<AISessionSummary[]>>;
    getSession(id: string): Promise<KernelResult<AISession>>;
    renameSession(id: string, title: string): Promise<KernelResult<void>>;
    deleteSession(id: string): Promise<KernelResult<void>>;
    startMCPServer(): Promise<KernelResult<AIMCPStatus>>;
    stopMCPServer(): Promise<KernelResult<AIMCPStatus>>;
    getMCPStatus(): Promise<KernelResult<AIMCPStatus>>;
    connectMCPClient(client: AIMCPClient): Promise<KernelResult<AIMCPClientResult>>;
    disconnectMCPClient(client: AIMCPClient): Promise<KernelResult<AIMCPClientResult>>;
    rotateMCPToken(): Promise<KernelResult<AIMCPStatus>>;
    setMCPAutoStart(on: boolean): Promise<KernelResult<AIMCPStatus>>;
    listChanges(): Promise<KernelResult<AIChangeProposal[]>>;
    getChange(id: string): Promise<KernelResult<AIChangeProposal>>;
    approveChange(req: AIChangeApproveRequest): Promise<KernelResult<AIChangeProposal>>;
    rejectChange(id: string, note: string): Promise<KernelResult<AIChangeProposal>>;
    resolveChatApproval(requestId: string, approve: boolean): Promise<KernelResult<void>>;
    listMemoryNotes(): Promise<KernelResult<AIMemoryNote[]>>;
    addMemoryNote(text: string): Promise<KernelResult<AIMemoryNote>>;
    deleteMemoryNote(id: string): Promise<KernelResult<void>>;
}
