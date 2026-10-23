// SPDX-License-Identifier: GPL-3.0-only

package app

func (a *App) GetAISettings() (AISettingsView, error) {
	return a.svc.AI.GetSettings()
}

func (a *App) SetAISettings(settings ProjectAISettings) (AISettingsView, error) {
	return a.svc.AI.SetSettings(settings)
}

func (a *App) SaveAIProviderKey(secret, host string) (AISettingsView, error) {
	return a.svc.AI.SaveKey(secret, host)
}

func (a *App) ClearAIProviderKey(host string) (AISettingsView, error) {
	return a.svc.AI.ClearKey(host)
}

func (a *App) PreviewAIChat(req AIPreviewRequest) (AIPreview, error) {
	return a.svc.AI.Preview(a.ctx, req)
}

func (a *App) SendAIChat(req AISendRequest) (AISendResult, error) {
	return a.svc.AI.Send(a.ctx, req)
}

func (a *App) CancelAIChat(requestID string) {
	a.svc.AI.CancelRequest(requestID)
}

func (a *App) RevokeAIDataGrant(sessionID string) {
	a.svc.AI.RevokeDataGrant(sessionID)
}

func (a *App) ListAIModels(host string) (AIModelCatalog, error) {
	return a.svc.AI.ListModels(a.ctx, host)
}

func (a *App) StartAIMCPServer() (AIMCPStatus, error) {
	return a.svc.AI.StartMCPServer()
}

func (a *App) StopAIMCPServer() AIMCPStatus {
	return a.svc.AI.StopMCPServer()
}

func (a *App) GetAIMCPStatus() AIMCPStatus {
	return a.svc.AI.MCPStatus()
}

func (a *App) ConnectAIMCPClient(client string) (AIMCPClientResult, error) {
	return a.svc.AI.ConnectMCPClient(a.ctx, client)
}

func (a *App) DisconnectAIMCPClient(client string) (AIMCPClientResult, error) {
	return a.svc.AI.DisconnectMCPClient(client)
}

func (a *App) RotateAIMCPToken() (AIMCPStatus, error) {
	return a.svc.AI.RotateMCPToken()
}

func (a *App) SetAIMCPAutoStart(on bool) (AIMCPStatus, error) {
	return a.svc.AI.SetMCPAutoStart(on)
}

func (a *App) ListAIMentions() (AIMentionCatalog, error) {
	return a.svc.AI.ListMentions(a.ctx)
}

func (a *App) CreateAISession() (AISession, error) {
	return a.svc.AI.CreateSession()
}

func (a *App) ListAISessions() ([]AISessionSummary, error) {
	return a.svc.AI.ListSessions()
}

func (a *App) GetAISession(id string) (AISession, error) {
	return a.svc.AI.GetSession(id)
}

func (a *App) RenameAISession(id, title string) error {
	return a.svc.AI.RenameSession(id, title)
}

func (a *App) DeleteAISession(id string) error {
	return a.svc.AI.DeleteSession(id)
}

func (a *App) ListAIChanges() ([]AIChangeProposal, error) {
	return a.svc.AI.ListChanges()
}

func (a *App) GetAIChange(id string) (AIChangeProposal, error) {
	return a.svc.AI.GetChange(id)
}

func (a *App) ApproveAIChange(req AIChangeApproveRequest) (AIChangeProposal, error) {
	return a.svc.AI.ApproveChange(a.ctx, req)
}

func (a *App) RejectAIChange(id, note string) (AIChangeProposal, error) {
	return a.svc.AI.RejectChange(id, note)
}

func (a *App) ResolveAIChatApproval(requestID string, approve bool) error {
	return a.svc.AI.ResolveChatApproval(requestID, approve)
}

func (a *App) ListAIMemoryNotes() ([]AIMemoryNote, error) {
	return a.svc.AI.ListMemoryNotes()
}

func (a *App) AddAIMemoryNote(text string) (AIMemoryNote, error) {
	return a.svc.AI.AddMemoryNote(text)
}

func (a *App) DeleteAIMemoryNote(id string) error {
	return a.svc.AI.DeleteMemoryNote(id)
}
