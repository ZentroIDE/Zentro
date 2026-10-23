// SPDX-License-Identifier: GPL-3.0-only

import {
    ClearAIProviderKey,
    CancelAIChat,
    CreateAISession,
    DeleteAISession,
    GetAIMCPStatus,
    GetAISettings,
    GetAISession,
    ListAIMentions,
    ListAIModels,
    ListAISessions,
    PreviewAIChat,
    RenameAISession,
    RevokeAIDataGrant,
    SaveAIProviderKey,
    SendAIChat,
    SetAISettings,
    StartAIMCPServer,
    StopAIMCPServer,
    ConnectAIMCPClient,
    DisconnectAIMCPClient,
    RotateAIMCPToken,
    SetAIMCPAutoStart,
    ListAIChanges,
    GetAIChange,
    ApproveAIChange,
    RejectAIChange,
    ResolveAIChatApproval,
    ListAIMemoryNotes,
    AddAIMemoryNote,
    DeleteAIMemoryNote,
} from '../../../wailsjs/go/app/App';
import type {
    AIChangeApproveRequest,
    AIPreviewRequest,
    AISendRequest,
    ProjectAISettings,
} from '../../lib/aiAssistant';

// Wails generates class types with convertValues(); the gateway uses the
// plain lib shapes. Cast only at this seam so tsc accepts both.
function toWailsArg<T>(value: T): never {
    return value as never;
}

export const aiAdapter = {
    GetAISettings,
    SetAISettings: (settings: ProjectAISettings) => SetAISettings(toWailsArg(settings)),
    SaveAIProviderKey,
    ClearAIProviderKey,
    PreviewAIChat: (request: AIPreviewRequest) => PreviewAIChat(toWailsArg(request)),
    SendAIChat: (request: AISendRequest) => SendAIChat(toWailsArg(request)),
    ListAIModels,
    ListAIMentions,
    CancelAIChat,
    RevokeAIDataGrant,
    CreateAISession,
    ListAISessions,
    GetAISession,
    RenameAISession,
    DeleteAISession,
    StartAIMCPServer,
    StopAIMCPServer,
    GetAIMCPStatus,
    ConnectAIMCPClient,
    DisconnectAIMCPClient,
    RotateAIMCPToken,
    SetAIMCPAutoStart,
    ListAIChanges,
    GetAIChange,
    ApproveAIChange: (req: AIChangeApproveRequest) => ApproveAIChange(toWailsArg(req)),
    RejectAIChange,
    ResolveAIChatApproval,
    ListAIMemoryNotes,
    AddAIMemoryNote,
    DeleteAIMemoryNote,
};
