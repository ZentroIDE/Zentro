// SPDX-License-Identifier: GPL-3.0-only

export interface AISensitiveMatch {
    type: string;
    sample: string;
    // Which part of the request held it, and the text around it. Shown only
    // on this computer, so the user can tell a real match from a false one.
    where?: string;
    context?: string;
}

const SENSITIVE_LABELS: Record<string, string> = {
    email: 'Email address',
    phone: 'Phone number',
    credit_card: 'Card number',
    jwt: 'Access token (JWT)',
    credential: 'Password or secret',
};

export function sensitiveLabel(type: string): string {
    return SENSITIVE_LABELS[type] ?? type.replace(/_/g, ' ');
}

export interface ProjectAISettings {
    enabled: boolean;
    allowCloud: boolean;
    baseURL: string;
    model: string;
    allowedHosts: string[];
    disabledConnectionIDs: string[];
    // Lets view, routine, and script text be read, by the chat and by MCP agents.
    includeBodies: boolean;
    // Lets list_connections show the host, port and user name of each connection.
    includeConnectionDetails: boolean;
    // The read_data, changes, and audit permission groups. Each is off by
    // default. read_data returns counts only, never row values.
    allowReadData: boolean;
    // Data mode (Pro): the assistant may read up to 10 rows per call. A cloud
    // model or production rows ask the user each time (ADR 0017).
    dataMode: boolean;
    // Send chat questions without the review step, in every chat of this
    // project. A question that looks like personal data is still held.
    autoApprove: boolean;
    allowChanges: boolean;
    allowAudit: boolean;
    // Lets the changes group propose a write for production.
    allowProduction: boolean;
}

export interface AIChangeStatement {
    n: number;
    kind: string;
    risk: string;
    rules: string[];
}

// What the agent says the change does. It is the agent's own account, so the
// review labels it as unverified.
export interface AIChangeExplanation {
    summary: string;
    affectedObjects: string[];
    expectedEffect: string;
    risks: string[];
    irreversible: boolean;
    rollbackPlan: string;
}

// One thing Zentro measured about the SQL itself. A check that could not run is
// `unavailable`, and the review says so instead of hiding it.
// Wails types the field as a plain string, so it is one here; the values are
// 'ok', 'warn', and 'unavailable'.
export type AIChangeCheckStatus = string;

export interface AIChangeCheck {
    name: string;
    status: AIChangeCheckStatus;
    detail: string;
}

export interface AIChangeProposal {
    id: string;
    state: string;
    title: string;
    rationale: string;
    env: string;
    sql: string;
    sqlNormalized: string;
    createdAt: string;
    expiresAt: string;
    requiresTypedConfirm: boolean;
    cooldownSeconds: number;
    verdict: string;
    statements: AIChangeStatement[];
    analysis?: { impact?: string; reason?: string };
    explanation?: AIChangeExplanation;
    checks?: AIChangeCheck[];
    rejectionNote?: string;
    failReason?: string;
    restorePointId?: string;
    reviewPresentedAt?: string;
}

// One saved fact about a connection. `agent` notes were written by the
// assistant, `user` notes by a person.
export interface AIMemoryNote {
    id: string;
    text: string;
    source: string;
    createdAt: string;
}

export interface AIChangeApproveRequest {
    id: string;
    confirmation: string;
    paramValues: unknown[];
}

export interface AIProviderStatus {
    id: string;
    label: string;
    host: string;
    baseURL: string;
    model: string;
    hasKey: boolean;
    keyHint: string;
    active: boolean;
    models: string[];
}

export interface AISettingsView extends ProjectAISettings {
    connectionDisabled: boolean;
    keyHint: string;
    hasKey: boolean;
    acpAvailable: boolean;
    mcpAvailable: boolean;
    airgap: boolean;
    production: boolean;
    // Set once after the update to ADR 0017, so the panel can say what changed.
    dataPolicyNotice: boolean;
    providers: AIProviderStatus[];
}

export interface AIPreviewRequest {
    message: string;
    includeBodies: boolean;
    acceptHost: boolean;
    acknowledgeSensitive: boolean;
    refresh: boolean;
    sessionId: string;
    mentions: string[];
    grantSession: boolean;
}

export interface AIPreview {
    host: string;
    model: string;
    body: string;
    data: string;
    estimatedTokens: number;
    historyTurns: number;
    sendToken: string;
    held: boolean;
    holdReason: string;
    matches: AISensitiveMatch[];
    loopback: boolean;
    granted: boolean;
}

export interface AISendRequest {
    message: string;
    includeBodies: boolean;
    acknowledgeSensitive: boolean;
    sendToken: string;
    sessionId: string;
    requestId: string;
    mentions: string[];
}

export interface AIUsage {
    input: number;
    output: number;
    cached: number;
}

export interface AISendResult {
    reply: string;
    sql: string;
    risk: string;
    held: boolean;
    holdReason: string;
    matches: AISensitiveMatch[];
    suggestions: string[];
    usage?: AIUsage;
    estimatedTokens: number;
    stopped: boolean;
    // Every request the reply sent, for the "Sent to" view.
    rounds?: AISentRound[];
    durationMs?: number;
}

// One request a reply sent to the model. Body is the exact bytes while the
// reply is live; a saved session replaces shared rows with a short note.
export interface AISentRound {
    requestId?: string;
    round: number;
    host: string;
    bytes: number;
    body: string;
    carriesRows: boolean;
}

// The reply waits on this: may these rows go to the model?
export interface AIChatApproval {
    requestId: string;
    round: number;
    host: string;
    loopback: boolean;
    env: string;
    production: boolean;
    results: AIChatApprovalResult[];
}

export interface AIChatApprovalResult {
    tool: string;
    label: string;
    rows: number;
    // The tool result exactly as it would be sent: a JSON envelope.
    content: string;
}

export interface AISessionTurn {
    id: string;
    role: string;
    text: string;
    sql: string;
    suggestions: string[];
    // What the model looked up for this reply, as short lines.
    tools: string[];
    // Every request the reply sent; shared rows are replaced by a note.
    rounds?: AISentRound[];
    // How long an assistant reply took, in milliseconds.
    durationMs?: number;
    usage?: AIUsage;
    createdAt: string;
}

export interface AISession {
    id: string;
    title: string;
    provider: string;
    model: string;
    createdAt: string;
    updatedAt: string;
    turns: AISessionTurn[];
}

export interface AISessionSummary {
    id: string;
    title: string;
    model: string;
    updatedAt: string;
    turnCount: number;
}

export interface AIMentionTable {
    name: string;
    columns: string[];
}

export interface AIMentionCatalog {
    schema: string;
    tables: AIMentionTable[];
}

export interface AIChatTool {
    requestId: string;
    label: string;
    withheld: boolean;
}

export interface AIMCPClientPresence {
    id: AIMCPClient | string;
    found: boolean;
    configured: boolean;
    removable: boolean;
}

export interface AIMCPStatus {
    running: boolean;
    url: string;
    token: string;
    calls: number;
    lastCall: string;
    blocked: string;
    autoStart: boolean;
    claudeDesktopFound: boolean;
    claudeDesktopConfigured: boolean;
    claudeCodeFound: boolean;
    nodeFound: boolean;
    clients?: AIMCPClientPresence[];
}

export type AIMCPClient = 'claude-desktop' | 'claude-code' | 'cursor';

export interface AIMCPClientResult {
    message: string;
    paths: string[];
}

export interface AIChatDelta {
    requestId: string;
    text: string;
}

export function toProjectSettings(view: AISettingsView): ProjectAISettings {
    return {
        enabled: view.enabled,
        allowCloud: view.allowCloud,
        baseURL: view.baseURL,
        model: view.model,
        allowedHosts: view.allowedHosts ?? [],
        disabledConnectionIDs: view.disabledConnectionIDs ?? [],
        includeBodies: Boolean(view.includeBodies),
        includeConnectionDetails: Boolean(view.includeConnectionDetails),
        allowReadData: Boolean(view.allowReadData),
        dataMode: Boolean(view.dataMode),
        autoApprove: Boolean(view.autoApprove),
        allowChanges: Boolean(view.allowChanges),
        allowAudit: Boolean(view.allowAudit),
        allowProduction: Boolean(view.allowProduction),
    };
}

// normalizeAISettings guards the view against nulls. Go marshals a nil slice
// as null, so any list may arrive as null even though the type says array.
export function normalizeAISettings(view: AISettingsView): AISettingsView {
    return {
        ...view,
        allowedHosts: view.allowedHosts ?? [],
        disabledConnectionIDs: view.disabledConnectionIDs ?? [],
        providers: (view.providers ?? []).map(item => ({
            ...item,
            models: item.models ?? [],
        })),
    };
}

export function activeAIProvider(view: AISettingsView): AIProviderStatus | undefined {
    return (view.providers ?? []).find(item => item.active);
}

// chatProviders is the list of hosts the backend offers. The backend owns it,
// so a provider is added in one place.
export function chatProviders(view: AISettingsView): AIProviderStatus[] {
    return view.providers ?? [];
}

export interface AIModelCatalog {
    host: string;
    models: string[];
}

// Go marshals a nil slice as null, so any list from the backend can arrive as
// null even though its type says array. These make every list an array before
// it reaches state, so no component has to guard each one.

export function normalizeSession(session: AISession): AISession {
    return {
        ...session,
        turns: (session.turns ?? []).map(turn => ({
            ...turn,
            suggestions: turn.suggestions ?? [],
            tools: turn.tools ?? [],
        })),
    };
}

export function normalizeSessions(
    items: AISessionSummary[] | null | undefined,
): AISessionSummary[] {
    return items ?? [];
}

export function normalizePreview(preview: AIPreview): AIPreview {
    return { ...preview, matches: preview.matches ?? [] };
}

export function normalizeSendResult(result: AISendResult): AISendResult {
    return {
        ...result,
        matches: result.matches ?? [],
        suggestions: result.suggestions ?? [],
    };
}

export function normalizeMentions(catalog: AIMentionCatalog): AIMentionCatalog {
    return {
        ...catalog,
        tables: (catalog.tables ?? []).map(table => ({ ...table, columns: table.columns ?? [] })),
    };
}

// Follow-up questions arrive at the end of a reply, either as a <suggestions>
// tag or as tool-call markup some models write instead (<｜DSML｜…). The
// backend takes them out of a saved reply. This hides them in a reply that is
// still streaming, and in any text that kept them, so they never show as text.
// <remember> carries notes for Zentro to save and <suggestions> the follow-ups;
// neither is part of the answer the user reads.
const MARKUP_START = /<remember>|<suggestions>|<\s*[|｜]+\s*DSML/;
const MARKUP_OPENERS = ['<remember>', '<suggestions>', '<｜DSML'];

export function visibleReplyText(text: string): string {
    const found = MARKUP_START.exec(text);
    const shown = found ? text.slice(0, found.index) : text;
    if (found) return shown.trimEnd();
    // The markup may be half written. Do not flash "<sugg" or "<｜" before it is complete.
    for (const opener of MARKUP_OPENERS) {
        for (let size = Math.min(opener.length - 1, shown.length); size >= 1; size -= 1) {
            if (shown.endsWith(opener.slice(0, size))) return shown.slice(0, -size).trimEnd();
        }
    }
    return shown.trimEnd();
}
