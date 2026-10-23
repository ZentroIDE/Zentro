export namespace ai {
	
	export class Match {
	    type: string;
	    sample: string;
	    where?: string;
	    context?: string;
	
	    static createFrom(source: any = {}) {
	        return new Match(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.sample = source["sample"];
	        this.where = source["where"];
	        this.context = source["context"];
	    }
	}

}

export namespace app {
	
	export class AIChangeApproveRequest {
	    id: string;
	    confirmation: string;
	    paramValues: number[][];
	
	    static createFrom(source: any = {}) {
	        return new AIChangeApproveRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.confirmation = source["confirmation"];
	        this.paramValues = source["paramValues"];
	    }
	}
	export class AIProposalExecResult {
	    n: number;
	    status: string;
	    rowsAffected: number;
	    elapsedMs: number;
	    sqlstate?: string;
	    constraint?: string;
	    message?: string;
	
	    static createFrom(source: any = {}) {
	        return new AIProposalExecResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.n = source["n"];
	        this.status = source["status"];
	        this.rowsAffected = source["rowsAffected"];
	        this.elapsedMs = source["elapsedMs"];
	        this.sqlstate = source["sqlstate"];
	        this.constraint = source["constraint"];
	        this.message = source["message"];
	    }
	}
	export class AIProposalCheck {
	    name: string;
	    status: string;
	    detail: string;
	
	    static createFrom(source: any = {}) {
	        return new AIProposalCheck(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.status = source["status"];
	        this.detail = source["detail"];
	    }
	}
	export class AIProposalExplanation {
	    summary: string;
	    affectedObjects: string[];
	    expectedEffect: string;
	    risks: string[];
	    irreversible: boolean;
	    rollbackPlan: string;
	
	    static createFrom(source: any = {}) {
	        return new AIProposalExplanation(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.summary = source["summary"];
	        this.affectedObjects = source["affectedObjects"];
	        this.expectedEffect = source["expectedEffect"];
	        this.risks = source["risks"];
	        this.irreversible = source["irreversible"];
	        this.rollbackPlan = source["rollbackPlan"];
	    }
	}
	export class AIProposalAnalysis {
	    impact?: string;
	    reason?: string;
	    details?: number[];
	
	    static createFrom(source: any = {}) {
	        return new AIProposalAnalysis(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.impact = source["impact"];
	        this.reason = source["reason"];
	        this.details = source["details"];
	    }
	}
	export class AIProposalStatement {
	    n: number;
	    kind: string;
	    risk: string;
	    rules: string[];
	
	    static createFrom(source: any = {}) {
	        return new AIProposalStatement(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.n = source["n"];
	        this.kind = source["kind"];
	        this.risk = source["risk"];
	        this.rules = source["rules"];
	    }
	}
	export class AIChangeProposal {
	    id: string;
	    state: string;
	    title: string;
	    rationale: string;
	    env: string;
	    sql: string;
	    sqlNormalized: string;
	    sqlHash: string;
	    params?: number[][];
	    createdAt: string;
	    expiresAt: string;
	    decidedAt?: string;
	    executedAt?: string;
	    projectId: string;
	    connectionId: string;
	    database: string;
	    schema: string;
	    driver: string;
	    requiresTypedConfirm: boolean;
	    cooldownSeconds: number;
	    verdict: string;
	    statements: AIProposalStatement[];
	    analysis: AIProposalAnalysis;
	    explanation?: AIProposalExplanation;
	    checks: AIProposalCheck[];
	    perStatement?: AIProposalExecResult[];
	    restorePointId?: string;
	    rejectionNote?: string;
	    failReason?: string;
	    reviewPresentedAt?: string;
	    deduplicated?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AIChangeProposal(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.state = source["state"];
	        this.title = source["title"];
	        this.rationale = source["rationale"];
	        this.env = source["env"];
	        this.sql = source["sql"];
	        this.sqlNormalized = source["sqlNormalized"];
	        this.sqlHash = source["sqlHash"];
	        this.params = source["params"];
	        this.createdAt = source["createdAt"];
	        this.expiresAt = source["expiresAt"];
	        this.decidedAt = source["decidedAt"];
	        this.executedAt = source["executedAt"];
	        this.projectId = source["projectId"];
	        this.connectionId = source["connectionId"];
	        this.database = source["database"];
	        this.schema = source["schema"];
	        this.driver = source["driver"];
	        this.requiresTypedConfirm = source["requiresTypedConfirm"];
	        this.cooldownSeconds = source["cooldownSeconds"];
	        this.verdict = source["verdict"];
	        this.statements = this.convertValues(source["statements"], AIProposalStatement);
	        this.analysis = this.convertValues(source["analysis"], AIProposalAnalysis);
	        this.explanation = this.convertValues(source["explanation"], AIProposalExplanation);
	        this.checks = this.convertValues(source["checks"], AIProposalCheck);
	        this.perStatement = this.convertValues(source["perStatement"], AIProposalExecResult);
	        this.restorePointId = source["restorePointId"];
	        this.rejectionNote = source["rejectionNote"];
	        this.failReason = source["failReason"];
	        this.reviewPresentedAt = source["reviewPresentedAt"];
	        this.deduplicated = source["deduplicated"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AIMCPClientPresence {
	    id: string;
	    found: boolean;
	    configured: boolean;
	    removable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AIMCPClientPresence(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.found = source["found"];
	        this.configured = source["configured"];
	        this.removable = source["removable"];
	    }
	}
	export class AIMCPClientResult {
	    message: string;
	    paths: string[];
	
	    static createFrom(source: any = {}) {
	        return new AIMCPClientResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.message = source["message"];
	        this.paths = source["paths"];
	    }
	}
	export class AIMCPStatus {
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
	    clients: AIMCPClientPresence[];
	
	    static createFrom(source: any = {}) {
	        return new AIMCPStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.running = source["running"];
	        this.url = source["url"];
	        this.token = source["token"];
	        this.calls = source["calls"];
	        this.lastCall = source["lastCall"];
	        this.blocked = source["blocked"];
	        this.autoStart = source["autoStart"];
	        this.claudeDesktopFound = source["claudeDesktopFound"];
	        this.claudeDesktopConfigured = source["claudeDesktopConfigured"];
	        this.claudeCodeFound = source["claudeCodeFound"];
	        this.nodeFound = source["nodeFound"];
	        this.clients = this.convertValues(source["clients"], AIMCPClientPresence);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AIMemoryNote {
	    id: string;
	    text: string;
	    source: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new AIMemoryNote(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.text = source["text"];
	        this.source = source["source"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class AIMentionTable {
	    name: string;
	    columns: string[];
	
	    static createFrom(source: any = {}) {
	        return new AIMentionTable(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.columns = source["columns"];
	    }
	}
	export class AIMentionCatalog {
	    schema: string;
	    tables: AIMentionTable[];
	
	    static createFrom(source: any = {}) {
	        return new AIMentionCatalog(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.schema = source["schema"];
	        this.tables = this.convertValues(source["tables"], AIMentionTable);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class AIModelCatalog {
	    host: string;
	    models: string[];
	
	    static createFrom(source: any = {}) {
	        return new AIModelCatalog(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.host = source["host"];
	        this.models = source["models"];
	    }
	}
	export class AIPreview {
	    host: string;
	    model: string;
	    body: string;
	    data: string;
	    estimatedTokens: number;
	    historyTurns: number;
	    sendToken: string;
	    held: boolean;
	    holdReason: string;
	    matches: ai.Match[];
	    loopback: boolean;
	    granted: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AIPreview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.host = source["host"];
	        this.model = source["model"];
	        this.body = source["body"];
	        this.data = source["data"];
	        this.estimatedTokens = source["estimatedTokens"];
	        this.historyTurns = source["historyTurns"];
	        this.sendToken = source["sendToken"];
	        this.held = source["held"];
	        this.holdReason = source["holdReason"];
	        this.matches = this.convertValues(source["matches"], ai.Match);
	        this.loopback = source["loopback"];
	        this.granted = source["granted"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AIPreviewRequest {
	    message: string;
	    includeBodies: boolean;
	    acceptHost: boolean;
	    acknowledgeSensitive: boolean;
	    refresh: boolean;
	    sessionId: string;
	    mentions: string[];
	    grantSession: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AIPreviewRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.message = source["message"];
	        this.includeBodies = source["includeBodies"];
	        this.acceptHost = source["acceptHost"];
	        this.acknowledgeSensitive = source["acknowledgeSensitive"];
	        this.refresh = source["refresh"];
	        this.sessionId = source["sessionId"];
	        this.mentions = source["mentions"];
	        this.grantSession = source["grantSession"];
	    }
	}
	
	
	
	
	
	export class AIProviderStatus {
	    id: string;
	    label: string;
	    host: string;
	    baseURL: string;
	    model: string;
	    hasKey: boolean;
	    keyHint: string;
	    active: boolean;
	    models: string[];
	
	    static createFrom(source: any = {}) {
	        return new AIProviderStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.host = source["host"];
	        this.baseURL = source["baseURL"];
	        this.model = source["model"];
	        this.hasKey = source["hasKey"];
	        this.keyHint = source["keyHint"];
	        this.active = source["active"];
	        this.models = source["models"];
	    }
	}
	export class AISendRequest {
	    message: string;
	    includeBodies: boolean;
	    acknowledgeSensitive: boolean;
	    sendToken: string;
	    sessionId: string;
	    requestId: string;
	    mentions: string[];
	
	    static createFrom(source: any = {}) {
	        return new AISendRequest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.message = source["message"];
	        this.includeBodies = source["includeBodies"];
	        this.acknowledgeSensitive = source["acknowledgeSensitive"];
	        this.sendToken = source["sendToken"];
	        this.sessionId = source["sessionId"];
	        this.requestId = source["requestId"];
	        this.mentions = source["mentions"];
	    }
	}
	export class AISentRound {
	    requestId?: string;
	    round: number;
	    host: string;
	    bytes: number;
	    body: string;
	    carriesRows: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AISentRound(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.requestId = source["requestId"];
	        this.round = source["round"];
	        this.host = source["host"];
	        this.bytes = source["bytes"];
	        this.body = source["body"];
	        this.carriesRows = source["carriesRows"];
	    }
	}
	export class AISessionUsage {
	    input: number;
	    output: number;
	    cached: number;
	
	    static createFrom(source: any = {}) {
	        return new AISessionUsage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.input = source["input"];
	        this.output = source["output"];
	        this.cached = source["cached"];
	    }
	}
	export class AISendResult {
	    reply: string;
	    sql: string;
	    risk: string;
	    held: boolean;
	    holdReason: string;
	    matches: ai.Match[];
	    suggestions: string[];
	    usage?: AISessionUsage;
	    estimatedTokens: number;
	    stopped: boolean;
	    rounds: AISentRound[];
	    durationMs: number;
	
	    static createFrom(source: any = {}) {
	        return new AISendResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.reply = source["reply"];
	        this.sql = source["sql"];
	        this.risk = source["risk"];
	        this.held = source["held"];
	        this.holdReason = source["holdReason"];
	        this.matches = this.convertValues(source["matches"], ai.Match);
	        this.suggestions = source["suggestions"];
	        this.usage = this.convertValues(source["usage"], AISessionUsage);
	        this.estimatedTokens = source["estimatedTokens"];
	        this.stopped = source["stopped"];
	        this.rounds = this.convertValues(source["rounds"], AISentRound);
	        this.durationMs = source["durationMs"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class AISessionMemory {
	    block: string;
	    tables: string[];
	    hot: string[];
	    noteIds: string[];
	
	    static createFrom(source: any = {}) {
	        return new AISessionMemory(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.block = source["block"];
	        this.tables = source["tables"];
	        this.hot = source["hot"];
	        this.noteIds = source["noteIds"];
	    }
	}
	export class AISessionTurn {
	    id: string;
	    role: string;
	    text: string;
	    sql: string;
	    suggestions: string[];
	    tools: string[];
	    rounds?: AISentRound[];
	    durationMs?: number;
	    usage?: AISessionUsage;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new AISessionTurn(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.role = source["role"];
	        this.text = source["text"];
	        this.sql = source["sql"];
	        this.suggestions = source["suggestions"];
	        this.tools = source["tools"];
	        this.rounds = this.convertValues(source["rounds"], AISentRound);
	        this.durationMs = source["durationMs"];
	        this.usage = this.convertValues(source["usage"], AISessionUsage);
	        this.createdAt = source["createdAt"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AISession {
	    id: string;
	    title: string;
	    provider: string;
	    model: string;
	    createdAt: string;
	    updatedAt: string;
	    turns: AISessionTurn[];
	    memory?: AISessionMemory;
	    summary?: string;
	    summaryThrough?: number;
	
	    static createFrom(source: any = {}) {
	        return new AISession(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.provider = source["provider"];
	        this.model = source["model"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	        this.turns = this.convertValues(source["turns"], AISessionTurn);
	        this.memory = this.convertValues(source["memory"], AISessionMemory);
	        this.summary = source["summary"];
	        this.summaryThrough = source["summaryThrough"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class AISessionSummary {
	    id: string;
	    title: string;
	    model: string;
	    updatedAt: string;
	    turnCount: number;
	
	    static createFrom(source: any = {}) {
	        return new AISessionSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.model = source["model"];
	        this.updatedAt = source["updatedAt"];
	        this.turnCount = source["turnCount"];
	    }
	}
	
	
	export class AISettingsView {
	    enabled: boolean;
	    allowCloud: boolean;
	    baseURL: string;
	    model: string;
	    allowedHosts: string[];
	    disabledConnectionIDs: string[];
	    includeBodies: boolean;
	    includeConnectionDetails: boolean;
	    allowReadData: boolean;
	    dataMode: boolean;
	    autoApprove: boolean;
	    dataPolicyNotice: boolean;
	    allowChanges: boolean;
	    allowAudit: boolean;
	    allowProduction: boolean;
	    connectionDisabled: boolean;
	    keyHint: string;
	    hasKey: boolean;
	    acpAvailable: boolean;
	    mcpAvailable: boolean;
	    airgap: boolean;
	    production: boolean;
	    providers: AIProviderStatus[];
	
	    static createFrom(source: any = {}) {
	        return new AISettingsView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.allowCloud = source["allowCloud"];
	        this.baseURL = source["baseURL"];
	        this.model = source["model"];
	        this.allowedHosts = source["allowedHosts"];
	        this.disabledConnectionIDs = source["disabledConnectionIDs"];
	        this.includeBodies = source["includeBodies"];
	        this.includeConnectionDetails = source["includeConnectionDetails"];
	        this.allowReadData = source["allowReadData"];
	        this.dataMode = source["dataMode"];
	        this.autoApprove = source["autoApprove"];
	        this.dataPolicyNotice = source["dataPolicyNotice"];
	        this.allowChanges = source["allowChanges"];
	        this.allowAudit = source["allowAudit"];
	        this.allowProduction = source["allowProduction"];
	        this.connectionDisabled = source["connectionDisabled"];
	        this.keyHint = source["keyHint"];
	        this.hasKey = source["hasKey"];
	        this.acpAvailable = source["acpAvailable"];
	        this.mcpAvailable = source["mcpAvailable"];
	        this.airgap = source["airgap"];
	        this.production = source["production"];
	        this.providers = this.convertValues(source["providers"], AIProviderStatus);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AboutInfo {
	    version: string;
	    commit: string;
	    date: string;
	    os: string;
	    channel: string;
	    canAutoUpdate: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AboutInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.commit = source["commit"];
	        this.date = source["date"];
	        this.os = source["os"];
	        this.channel = source["channel"];
	        this.canAutoUpdate = source["canAutoUpdate"];
	    }
	}
	export class AppDebugLogEntry {
	    time: string;
	    level: string;
	    msg: string;
	    extra?: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new AppDebugLogEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.time = source["time"];
	        this.level = source["level"];
	        this.msg = source["msg"];
	        this.extra = source["extra"];
	    }
	}
	export class AppDebugLogOpts {
	    lines_from_end: number;
	    min_level: string;
	    search: string;
	
	    static createFrom(source: any = {}) {
	        return new AppDebugLogOpts(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.lines_from_end = source["lines_from_end"];
	        this.min_level = source["min_level"];
	        this.search = source["search"];
	    }
	}
	export class ImportColumnMapping {
	    sourceColumn: string;
	    targetColumn: string;
	
	    static createFrom(source: any = {}) {
	        return new ImportColumnMapping(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sourceColumn = source["sourceColumn"];
	        this.targetColumn = source["targetColumn"];
	    }
	}
	export class CSVImportOptions {
	    filePath: string;
	    delimiter: string;
	    hasHeader: boolean;
	    schema: string;
	    table: string;
	    mappings: ImportColumnMapping[];
	    nullToken: string;
	    trimWhitespace: boolean;
	    batchSize: number;
	    onError: string;
	    singleTransaction: boolean;
	    truncateFirst: boolean;
	
	    static createFrom(source: any = {}) {
	        return new CSVImportOptions(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filePath = source["filePath"];
	        this.delimiter = source["delimiter"];
	        this.hasHeader = source["hasHeader"];
	        this.schema = source["schema"];
	        this.table = source["table"];
	        this.mappings = this.convertValues(source["mappings"], ImportColumnMapping);
	        this.nullToken = source["nullToken"];
	        this.trimWhitespace = source["trimWhitespace"];
	        this.batchSize = source["batchSize"];
	        this.onError = source["onError"];
	        this.singleTransaction = source["singleTransaction"];
	        this.truncateFirst = source["truncateFirst"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CSVImportPreview {
	    columns: string[];
	    sampleRows: string[][];
	    inferredTypes: string[];
	    fileSizeBytes: number;
	
	    static createFrom(source: any = {}) {
	        return new CSVImportPreview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.columns = source["columns"];
	        this.sampleRows = source["sampleRows"];
	        this.inferredTypes = source["inferredTypes"];
	        this.fileSizeBytes = source["fileSizeBytes"];
	    }
	}
	export class ConnectionRuntimeState {
	    profile?: models.ConnectionProfile;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionRuntimeState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.profile = this.convertValues(source["profile"], models.ConnectionProfile);
	        this.status = source["status"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ConnectionUsageRef {
	    project_id: string;
	    project_name: string;
	    environment_key: string;
	    environment_name: string;
	    database: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionUsageRef(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.project_id = source["project_id"];
	        this.project_name = source["project_name"];
	        this.environment_key = source["environment_key"];
	        this.environment_name = source["environment_name"];
	        this.database = source["database"];
	    }
	}
	export class ExecutionPolicy {
	    timeout_seconds: number;
	    row_cap_per_tab: number;
	    destructive_rules: string;
	    environment_strictness: string;
	    safety_level: string;
	    is_production: boolean;
	    locked: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ExecutionPolicy(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.timeout_seconds = source["timeout_seconds"];
	        this.row_cap_per_tab = source["row_cap_per_tab"];
	        this.destructive_rules = source["destructive_rules"];
	        this.environment_strictness = source["environment_strictness"];
	        this.safety_level = source["safety_level"];
	        this.is_production = source["is_production"];
	        this.locked = source["locked"];
	    }
	}
	export class GitCommitFileDiff {
	    path: string;
	    before: string;
	    after: string;
	
	    static createFrom(source: any = {}) {
	        return new GitCommitFileDiff(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.before = source["before"];
	        this.after = source["after"];
	    }
	}
	export class GitCommitResult {
	    hash?: string;
	    message: string;
	    files: string[];
	    created_at: string;
	    no_changes: boolean;
	
	    static createFrom(source: any = {}) {
	        return new GitCommitResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hash = source["hash"];
	        this.message = source["message"];
	        this.files = source["files"];
	        this.created_at = source["created_at"];
	        this.no_changes = source["no_changes"];
	    }
	}
	export class GitTimelineItem {
	    hash: string;
	    message: string;
	    event_type: string;
	    author: string;
	    when: string;
	    files: string[];
	
	    static createFrom(source: any = {}) {
	        return new GitTimelineItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hash = source["hash"];
	        this.message = source["message"];
	        this.event_type = source["event_type"];
	        this.author = source["author"];
	        this.when = source["when"];
	        this.files = source["files"];
	    }
	}
	export class GitTrackingStatus {
	    enabled: boolean;
	    initialized: boolean;
	    repo_path?: string;
	    project_id?: string;
	    last_commit_hash?: string;
	    last_error?: string;
	    pending_count?: number;
	
	    static createFrom(source: any = {}) {
	        return new GitTrackingStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.initialized = source["initialized"];
	        this.repo_path = source["repo_path"];
	        this.project_id = source["project_id"];
	        this.last_commit_hash = source["last_commit_hash"];
	        this.last_error = source["last_error"];
	        this.pending_count = source["pending_count"];
	    }
	}
	
	export class ImporterInfo {
	    key: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new ImporterInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.name = source["name"];
	    }
	}
	export class JobCapabilities {
	    cancel: boolean;
	    kill: boolean;
	
	    static createFrom(source: any = {}) {
	        return new JobCapabilities(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cancel = source["cancel"];
	        this.kill = source["kill"];
	    }
	}
	export class JobProgress {
	    done: number;
	    total?: number;
	    unit?: string;
	    detail?: string;
	
	    static createFrom(source: any = {}) {
	        return new JobProgress(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.done = source["done"];
	        this.total = source["total"];
	        this.unit = source["unit"];
	        this.detail = source["detail"];
	    }
	}
	export class Job {
	    id: string;
	    kind: string;
	    title: string;
	    profileName?: string;
	    database?: string;
	    tabId?: string;
	    status: string;
	    progress: JobProgress;
	    // Go type: time
	    startedAt: any;
	    // Go type: time
	    finishedAt?: any;
	    error?: string;
	    capabilities: JobCapabilities;
	    backendId?: string;
	    meta?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new Job(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.kind = source["kind"];
	        this.title = source["title"];
	        this.profileName = source["profileName"];
	        this.database = source["database"];
	        this.tabId = source["tabId"];
	        this.status = source["status"];
	        this.progress = this.convertValues(source["progress"], JobProgress);
	        this.startedAt = this.convertValues(source["startedAt"], null);
	        this.finishedAt = this.convertValues(source["finishedAt"], null);
	        this.error = source["error"];
	        this.capabilities = this.convertValues(source["capabilities"], JobCapabilities);
	        this.backendId = source["backendId"];
	        this.meta = source["meta"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class LastUpdateResult {
	    ok: boolean;
	    version: string;
	    error: string;
	
	    static createFrom(source: any = {}) {
	        return new LastUpdateResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.version = source["version"];
	        this.error = source["error"];
	    }
	}
	export class WritePreviewPage {
	    columns: string[];
	    rows: string[][];
	    has_more: boolean;
	    total_count: number;
	    table_name?: string;
	
	    static createFrom(source: any = {}) {
	        return new WritePreviewPage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.columns = source["columns"];
	        this.rows = source["rows"];
	        this.has_more = source["has_more"];
	        this.total_count = source["total_count"];
	        this.table_name = source["table_name"];
	    }
	}
	export class OpenWritePreviewResult {
	    preview_session_id: string;
	    preview_tab_query_label: string;
	    initial_result_meta: WritePreviewPage;
	
	    static createFrom(source: any = {}) {
	        return new OpenWritePreviewResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.preview_session_id = source["preview_session_id"];
	        this.preview_tab_query_label = source["preview_tab_query_label"];
	        this.initial_result_meta = this.convertValues(source["initial_result_meta"], WritePreviewPage);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ProSecurityState {
	    app_lock_enabled: boolean;
	    app_lock_configured: boolean;
	    app_lock_timeout_sec: number;
	    app_locked: boolean;
	    secret_vault_enabled: boolean;
	    secret_vault_ready: boolean;
	    secret_vault_unlocked: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ProSecurityState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.app_lock_enabled = source["app_lock_enabled"];
	        this.app_lock_configured = source["app_lock_configured"];
	        this.app_lock_timeout_sec = source["app_lock_timeout_sec"];
	        this.app_locked = source["app_locked"];
	        this.secret_vault_enabled = source["secret_vault_enabled"];
	        this.secret_vault_ready = source["secret_vault_ready"];
	        this.secret_vault_unlocked = source["secret_vault_unlocked"];
	    }
	}
	export class ProductionWriteUnlockState {
	    environment_key: string;
	    unlocked: boolean;
	    unlock_until?: string;
	
	    static createFrom(source: any = {}) {
	        return new ProductionWriteUnlockState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.environment_key = source["environment_key"];
	        this.unlocked = source["unlocked"];
	        this.unlock_until = source["unlock_until"];
	    }
	}
	export class ProjectAISettings {
	    enabled: boolean;
	    allowCloud: boolean;
	    baseURL: string;
	    model: string;
	    allowedHosts: string[];
	    disabledConnectionIDs: string[];
	    includeBodies: boolean;
	    includeConnectionDetails: boolean;
	    allowReadData: boolean;
	    dataMode: boolean;
	    allowChanges: boolean;
	    allowAudit: boolean;
	    autoApprove: boolean;
	    allowProduction: boolean;
	    version: number;
	    dataPolicyNotice: boolean;
	    knownModels: Record<string, Array<string>>;
	
	    static createFrom(source: any = {}) {
	        return new ProjectAISettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.allowCloud = source["allowCloud"];
	        this.baseURL = source["baseURL"];
	        this.model = source["model"];
	        this.allowedHosts = source["allowedHosts"];
	        this.disabledConnectionIDs = source["disabledConnectionIDs"];
	        this.includeBodies = source["includeBodies"];
	        this.includeConnectionDetails = source["includeConnectionDetails"];
	        this.allowReadData = source["allowReadData"];
	        this.dataMode = source["dataMode"];
	        this.allowChanges = source["allowChanges"];
	        this.allowAudit = source["allowAudit"];
	        this.autoApprove = source["autoApprove"];
	        this.allowProduction = source["allowProduction"];
	        this.version = source["version"];
	        this.dataPolicyNotice = source["dataPolicyNotice"];
	        this.knownModels = source["knownModels"];
	    }
	}
	export class QueryAuditMeta {
	    reason?: string;
	    risk_level?: string;
	    preview_row_count?: number;
	    used_protection_layers?: string[];
	    snapshot_ref?: string;
	
	    static createFrom(source: any = {}) {
	        return new QueryAuditMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.reason = source["reason"];
	        this.risk_level = source["risk_level"];
	        this.preview_row_count = source["preview_row_count"];
	        this.used_protection_layers = source["used_protection_layers"];
	        this.snapshot_ref = source["snapshot_ref"];
	    }
	}
	export class QueryPreviewResult {
	    supported: boolean;
	    affected_row_count: number;
	    count_known: boolean;
	    columns?: string[];
	    rows?: string[][];
	    fallback_reason?: string;
	
	    static createFrom(source: any = {}) {
	        return new QueryPreviewResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.supported = source["supported"];
	        this.affected_row_count = source["affected_row_count"];
	        this.count_known = source["count_known"];
	        this.columns = source["columns"];
	        this.rows = source["rows"];
	        this.fallback_reason = source["fallback_reason"];
	    }
	}
	export class QueryPreflightStatement {
	    statement_text: string;
	    operation: string;
	    risk_level: string;
	    has_where: boolean;
	    destructive: boolean;
	    preview_supported: boolean;
	    type_to_confirm_text?: string;
	
	    static createFrom(source: any = {}) {
	        return new QueryPreflightStatement(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statement_text = source["statement_text"];
	        this.operation = source["operation"];
	        this.risk_level = source["risk_level"];
	        this.has_where = source["has_where"];
	        this.destructive = source["destructive"];
	        this.preview_supported = source["preview_supported"];
	        this.type_to_confirm_text = source["type_to_confirm_text"];
	    }
	}
	export class QueryPreflightResult {
	    statements: QueryPreflightStatement[];
	    risk_level: string;
	    requires_pro: boolean;
	    requires_production_unlock: boolean;
	    production_unlock: ProductionWriteUnlockState;
	    requires_type_to_confirm: boolean;
	    type_to_confirm_text?: string;
	    requires_cooldown: boolean;
	    cooldown_seconds?: number;
	    requires_reason: boolean;
	    affected_rows_preview: QueryPreviewResult;
	    used_protection_layers?: string[];
	    transaction_suggested: boolean;
	    snapshot_required: boolean;
	
	    static createFrom(source: any = {}) {
	        return new QueryPreflightResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.statements = this.convertValues(source["statements"], QueryPreflightStatement);
	        this.risk_level = source["risk_level"];
	        this.requires_pro = source["requires_pro"];
	        this.requires_production_unlock = source["requires_production_unlock"];
	        this.production_unlock = this.convertValues(source["production_unlock"], ProductionWriteUnlockState);
	        this.requires_type_to_confirm = source["requires_type_to_confirm"];
	        this.type_to_confirm_text = source["type_to_confirm_text"];
	        this.requires_cooldown = source["requires_cooldown"];
	        this.cooldown_seconds = source["cooldown_seconds"];
	        this.requires_reason = source["requires_reason"];
	        this.affected_rows_preview = this.convertValues(source["affected_rows_preview"], QueryPreviewResult);
	        this.used_protection_layers = source["used_protection_layers"];
	        this.transaction_suggested = source["transaction_suggested"];
	        this.snapshot_required = source["snapshot_required"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class SCCommit {
	    hash: string;
	    message: string;
	    author: string;
	    when: string;
	
	    static createFrom(source: any = {}) {
	        return new SCCommit(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hash = source["hash"];
	        this.message = source["message"];
	        this.author = source["author"];
	        this.when = source["when"];
	    }
	}
	export class SCFileStatus {
	    path: string;
	    staged: boolean;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new SCFileStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.staged = source["staged"];
	        this.status = source["status"];
	    }
	}
	export class SCStatus {
	    branch: string;
	    files: SCFileStatus[];
	    clean: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SCStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.branch = source["branch"];
	        this.files = this.convertValues(source["files"], SCFileStatus);
	        this.clean = source["clean"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SQLAuditEntry {
	    id: string;
	    executed_at: string;
	    source_tab_id?: string;
	    tab_id?: string;
	    statement_text: string;
	    statement_index: number;
	    statement_count: number;
	    profile: string;
	    database: string;
	    driver?: string;
	    env_key?: string;
	    project_id?: string;
	    duration_ms: number;
	    row_count: number;
	    is_select: boolean;
	    reason?: string;
	    risk_level?: string;
	    preview_row_count?: number;
	    used_protection_layers?: string[];
	    snapshot_ref?: string;
	    pinned?: boolean;
	    error?: string;
	    source?: string;
	    actor?: string;
	    action?: string;
	    verdict?: string;
	    outcome?: string;
	    sql_normalized?: string;
	    sql_hash?: string;
	    proposal_id?: string;
	    restore_point_id?: string;
	    prev_hash?: string;
	    hash?: string;
	
	    static createFrom(source: any = {}) {
	        return new SQLAuditEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.executed_at = source["executed_at"];
	        this.source_tab_id = source["source_tab_id"];
	        this.tab_id = source["tab_id"];
	        this.statement_text = source["statement_text"];
	        this.statement_index = source["statement_index"];
	        this.statement_count = source["statement_count"];
	        this.profile = source["profile"];
	        this.database = source["database"];
	        this.driver = source["driver"];
	        this.env_key = source["env_key"];
	        this.project_id = source["project_id"];
	        this.duration_ms = source["duration_ms"];
	        this.row_count = source["row_count"];
	        this.is_select = source["is_select"];
	        this.reason = source["reason"];
	        this.risk_level = source["risk_level"];
	        this.preview_row_count = source["preview_row_count"];
	        this.used_protection_layers = source["used_protection_layers"];
	        this.snapshot_ref = source["snapshot_ref"];
	        this.pinned = source["pinned"];
	        this.error = source["error"];
	        this.source = source["source"];
	        this.actor = source["actor"];
	        this.action = source["action"];
	        this.verdict = source["verdict"];
	        this.outcome = source["outcome"];
	        this.sql_normalized = source["sql_normalized"];
	        this.sql_hash = source["sql_hash"];
	        this.proposal_id = source["proposal_id"];
	        this.restore_point_id = source["restore_point_id"];
	        this.prev_hash = source["prev_hash"];
	        this.hash = source["hash"];
	    }
	}
	export class SQLAuditFilter {
	    search: string;
	    status: string;
	    profile: string;
	    limit: number;
	    pinned_only?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SQLAuditFilter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.search = source["search"];
	        this.status = source["status"];
	        this.profile = source["profile"];
	        this.limit = source["limit"];
	        this.pinned_only = source["pinned_only"];
	    }
	}
	export class SchemaRollbackTarget {
	    hash: string;
	    message: string;
	    when: string;
	    schema?: string;
	    driver?: string;
	    environment?: string;
	
	    static createFrom(source: any = {}) {
	        return new SchemaRollbackTarget(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hash = source["hash"];
	        this.message = source["message"];
	        this.when = source["when"];
	        this.schema = source["schema"];
	        this.driver = source["driver"];
	        this.environment = source["environment"];
	    }
	}
	export class ServerSessionView {
	    id: string;
	    user: string;
	    database: string;
	    client: string;
	    state: string;
	    // Go type: time
	    startedAt: any;
	    durationMs: number;
	    wait: string;
	    query: string;
	    isSelf: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ServerSessionView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.user = source["user"];
	        this.database = source["database"];
	        this.client = source["client"];
	        this.state = source["state"];
	        this.startedAt = this.convertValues(source["startedAt"], null);
	        this.durationMs = source["durationMs"];
	        this.wait = source["wait"];
	        this.query = source["query"];
	        this.isSelf = source["isSelf"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TerminalInfo {
	    id: string;
	    kind: string;
	    title: string;
	
	    static createFrom(source: any = {}) {
	        return new TerminalInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.kind = source["kind"];
	        this.title = source["title"];
	    }
	}
	export class UpdateInfo {
	    latest_version: string;
	    release_url: string;
	    changelog: string;
	    has_update: boolean;
	    download_url: string;
	    checksum_sha256?: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.latest_version = source["latest_version"];
	        this.release_url = source["release_url"];
	        this.changelog = source["changelog"];
	        this.has_update = source["has_update"];
	        this.download_url = source["download_url"];
	        this.checksum_sha256 = source["checksum_sha256"];
	    }
	}

}

export namespace core {
	
	export class DriverDescriptor {
	    name: string;
	    capabilities: string[];
	
	    static createFrom(source: any = {}) {
	        return new DriverDescriptor(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.capabilities = source["capabilities"];
	    }
	}

}

export namespace license {
	
	export class AccessResult {
	    allowed: boolean;
	    code: string;
	    required_tier?: string;
	
	    static createFrom(source: any = {}) {
	        return new AccessResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.allowed = source["allowed"];
	        this.code = source["code"];
	        this.required_tier = source["required_tier"];
	    }
	}
	export class CapabilityConfig {
	    enabled: boolean;
	    tier?: string;
	    limit?: number;
	    reason?: string;
	    rules?: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new CapabilityConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.enabled = source["enabled"];
	        this.tier = source["tier"];
	        this.limit = source["limit"];
	        this.reason = source["reason"];
	        this.rules = source["rules"];
	    }
	}
	export class Entitlement {
	    feature_id: string;
	    enabled: boolean;
	    limit?: number;
	
	    static createFrom(source: any = {}) {
	        return new Entitlement(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.feature_id = source["feature_id"];
	        this.enabled = source["enabled"];
	        this.limit = source["limit"];
	    }
	}
	export class URLs {
	    upgrade?: string;
	    manage?: string;
	
	    static createFrom(source: any = {}) {
	        return new URLs(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.upgrade = source["upgrade"];
	        this.manage = source["manage"];
	    }
	}
	export class Policy {
	    require_online_refresh: boolean;
	    refresh_interval_minute: number;
	
	    static createFrom(source: any = {}) {
	        return new Policy(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.require_online_refresh = source["require_online_refresh"];
	        this.refresh_interval_minute = source["refresh_interval_minute"];
	    }
	}
	export class EntitlementPayload {
	    installation_id?: string;
	    plan?: string;
	    status: string;
	    source?: string;
	    // Go type: time
	    expires_at?: any;
	    // Go type: time
	    offline_until?: any;
	    // Go type: time
	    issued_at?: any;
	    capabilities?: Record<string, CapabilityConfig>;
	    limits?: Record<string, number>;
	    policy: Policy;
	    urls: URLs;
	
	    static createFrom(source: any = {}) {
	        return new EntitlementPayload(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.installation_id = source["installation_id"];
	        this.plan = source["plan"];
	        this.status = source["status"];
	        this.source = source["source"];
	        this.expires_at = this.convertValues(source["expires_at"], null);
	        this.offline_until = this.convertValues(source["offline_until"], null);
	        this.issued_at = this.convertValues(source["issued_at"], null);
	        this.capabilities = this.convertValues(source["capabilities"], CapabilityConfig, true);
	        this.limits = source["limits"];
	        this.policy = this.convertValues(source["policy"], Policy);
	        this.urls = this.convertValues(source["urls"], URLs);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Limit {
	    id: string;
	    value: number;
	
	    static createFrom(source: any = {}) {
	        return new Limit(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.value = source["value"];
	    }
	}
	
	export class SeatInfo {
	    seat_id: string;
	    total_seats: number;
	    used_seats: number;
	
	    static createFrom(source: any = {}) {
	        return new SeatInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.seat_id = source["seat_id"];
	        this.total_seats = source["total_seats"];
	        this.used_seats = source["used_seats"];
	    }
	}
	export class SignatureInfo {
	    verified: boolean;
	    source?: string;
	    algorithm?: string;
	    key_id?: string;
	    reason?: string;
	
	    static createFrom(source: any = {}) {
	        return new SignatureInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.verified = source["verified"];
	        this.source = source["source"];
	        this.algorithm = source["algorithm"];
	        this.key_id = source["key_id"];
	        this.reason = source["reason"];
	    }
	}
	export class SignedEntitlement {
	    payload: EntitlementPayload;
	    signature?: string;
	    key_id?: string;
	    algorithm?: string;
	
	    static createFrom(source: any = {}) {
	        return new SignedEntitlement(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.payload = this.convertValues(source["payload"], EntitlementPayload);
	        this.signature = source["signature"];
	        this.key_id = source["key_id"];
	        this.algorithm = source["algorithm"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class State {
	    status: string;
	    tier?: string;
	    masked_key?: string;
	    session_token?: string;
	    // Go type: time
	    expires_at?: any;
	    entitlements: Entitlement[];
	    limits?: Limit[];
	    capabilities?: Record<string, CapabilityConfig>;
	    limit_map?: Record<string, number>;
	    policy: Policy;
	    urls: URLs;
	    last_error?: string;
	    // Go type: time
	    last_sync_at?: any;
	    // Go type: time
	    next_refresh_at?: any;
	    // Go type: time
	    offline_grace_until?: any;
	    installation_id?: string;
	    saved_email?: string;
	    restore_available?: boolean;
	    // Go type: time
	    issued_at?: any;
	    signature_meta?: SignatureInfo;
	    signed_entitlement?: SignedEntitlement;
	    seat: SeatInfo;
	
	    static createFrom(source: any = {}) {
	        return new State(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.tier = source["tier"];
	        this.masked_key = source["masked_key"];
	        this.session_token = source["session_token"];
	        this.expires_at = this.convertValues(source["expires_at"], null);
	        this.entitlements = this.convertValues(source["entitlements"], Entitlement);
	        this.limits = this.convertValues(source["limits"], Limit);
	        this.capabilities = this.convertValues(source["capabilities"], CapabilityConfig, true);
	        this.limit_map = source["limit_map"];
	        this.policy = this.convertValues(source["policy"], Policy);
	        this.urls = this.convertValues(source["urls"], URLs);
	        this.last_error = source["last_error"];
	        this.last_sync_at = this.convertValues(source["last_sync_at"], null);
	        this.next_refresh_at = this.convertValues(source["next_refresh_at"], null);
	        this.offline_grace_until = this.convertValues(source["offline_grace_until"], null);
	        this.installation_id = source["installation_id"];
	        this.saved_email = source["saved_email"];
	        this.restore_available = source["restore_available"];
	        this.issued_at = this.convertValues(source["issued_at"], null);
	        this.signature_meta = this.convertValues(source["signature_meta"], SignatureInfo);
	        this.signed_entitlement = this.convertValues(source["signed_entitlement"], SignedEntitlement);
	        this.seat = this.convertValues(source["seat"], SeatInfo);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace models {
	
	export class Bookmark {
	    id: string;
	    line: number;
	    label?: string;
	    // Go type: time
	    created_at: any;
	
	    static createFrom(source: any = {}) {
	        return new Bookmark(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.line = source["line"];
	        this.label = source["label"];
	        this.created_at = this.convertValues(source["created_at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CatalogObjectDetails {
	    objectKind: string;
	    name: string;
	    schema: string;
	    tableName?: string;
	    ddl?: string;
	    signature?: string;
	    columns?: string[];
	    unique: boolean;
	    primaryKey: boolean;
	    unsupportedMessage?: string;
	
	    static createFrom(source: any = {}) {
	        return new CatalogObjectDetails(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.objectKind = source["objectKind"];
	        this.name = source["name"];
	        this.schema = source["schema"];
	        this.tableName = source["tableName"];
	        this.ddl = source["ddl"];
	        this.signature = source["signature"];
	        this.columns = source["columns"];
	        this.unique = source["unique"];
	        this.primaryKey = source["primaryKey"];
	        this.unsupportedMessage = source["unsupportedMessage"];
	    }
	}
	export class CheckConstraintInfo {
	    Name: string;
	    Expression: string;
	
	    static createFrom(source: any = {}) {
	        return new CheckConstraintInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Expression = source["Expression"];
	    }
	}
	export class ColumnDef {
	    Name: string;
	    DataType: string;
	    FullDataType?: string;
	    Description?: string;
	    IsPrimaryKey: boolean;
	    IsNullable: boolean;
	    DefaultValue: string;
	    GenerationKind?: string;
	    IdentityGeneration?: string;
	    SequenceSchema?: string;
	    SequenceName?: string;
	
	    static createFrom(source: any = {}) {
	        return new ColumnDef(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.DataType = source["DataType"];
	        this.FullDataType = source["FullDataType"];
	        this.Description = source["Description"];
	        this.IsPrimaryKey = source["IsPrimaryKey"];
	        this.IsNullable = source["IsNullable"];
	        this.DefaultValue = source["DefaultValue"];
	        this.GenerationKind = source["GenerationKind"];
	        this.IdentityGeneration = source["IdentityGeneration"];
	        this.SequenceSchema = source["SequenceSchema"];
	        this.SequenceName = source["SequenceName"];
	    }
	}
	export class ConnectionProfile {
	    id: string;
	    name: string;
	    driver: string;
	    host: string;
	    port: number;
	    username: string;
	    password: string;
	    db_name?: string;
	    ssl_mode?: string;
	    connect_timeout: number;
	    save_password: boolean;
	    encrypt_password: boolean;
	    show_all_schemas: boolean;
	    trust_server_cert: boolean;
	    tls_min_version?: string;
	    tls_legacy_ciphers?: boolean;
	    ssh_enabled?: boolean;
	    ssh_host?: string;
	    ssh_port?: number;
	    ssh_user?: string;
	    ssh_auth?: string;
	    ssh_key_path?: string;
	    ssh_password?: string;
	    ssh_passphrase?: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.driver = source["driver"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.db_name = source["db_name"];
	        this.ssl_mode = source["ssl_mode"];
	        this.connect_timeout = source["connect_timeout"];
	        this.save_password = source["save_password"];
	        this.encrypt_password = source["encrypt_password"];
	        this.show_all_schemas = source["show_all_schemas"];
	        this.trust_server_cert = source["trust_server_cert"];
	        this.tls_min_version = source["tls_min_version"];
	        this.tls_legacy_ciphers = source["tls_legacy_ciphers"];
	        this.ssh_enabled = source["ssh_enabled"];
	        this.ssh_host = source["ssh_host"];
	        this.ssh_port = source["ssh_port"];
	        this.ssh_user = source["ssh_user"];
	        this.ssh_auth = source["ssh_auth"];
	        this.ssh_key_path = source["ssh_key_path"];
	        this.ssh_password = source["ssh_password"];
	        this.ssh_passphrase = source["ssh_passphrase"];
	    }
	}
	export class ForeignKeyInfo {
	    Name: string;
	    Columns: string[];
	    RefSchema: string;
	    RefTable: string;
	    RefColumns: string[];
	    OnDelete: string;
	    OnUpdate: string;
	
	    static createFrom(source: any = {}) {
	        return new ForeignKeyInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Columns = source["Columns"];
	        this.RefSchema = source["RefSchema"];
	        this.RefTable = source["RefTable"];
	        this.RefColumns = source["RefColumns"];
	        this.OnDelete = source["OnDelete"];
	        this.OnUpdate = source["OnUpdate"];
	    }
	}
	export class IndexInfo {
	    Name: string;
	    Table: string;
	    Columns: string[];
	    Unique: boolean;
	
	    static createFrom(source: any = {}) {
	        return new IndexInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Table = source["Table"];
	        this.Columns = source["Columns"];
	        this.Unique = source["Unique"];
	    }
	}
	export class PrimaryKeyInfo {
	    Name: string;
	    Columns: string[];
	
	    static createFrom(source: any = {}) {
	        return new PrimaryKeyInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Columns = source["Columns"];
	    }
	}
	export class SQLCompletionMemoryEntry {
	    suggestionKey: string;
	    suggestionKind: string;
	    contextBucket: string;
	    acceptCount: number;
	    lastAcceptedAt: number;
	
	    static createFrom(source: any = {}) {
	        return new SQLCompletionMemoryEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.suggestionKey = source["suggestionKey"];
	        this.suggestionKind = source["suggestionKind"];
	        this.contextBucket = source["contextBucket"];
	        this.acceptCount = source["acceptCount"];
	        this.lastAcceptedAt = source["lastAcceptedAt"];
	    }
	}
	export class SQLCompletionMemory {
	    version: number;
	    entries: SQLCompletionMemoryEntry[];
	
	    static createFrom(source: any = {}) {
	        return new SQLCompletionMemory(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.entries = this.convertValues(source["entries"], SQLCompletionMemoryEntry);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ProjectAsset {
	    id: string;
	    project_id: string;
	    type: string;
	    name: string;
	    description?: string;
	    tags?: string[];
	    created_at: string;
	    updated_at: string;
	
	    static createFrom(source: any = {}) {
	        return new ProjectAsset(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.project_id = source["project_id"];
	        this.type = source["type"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.tags = source["tags"];
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	    }
	}
	export class ProjectConnection {
	    id: string;
	    project_id: string;
	    environment_key: string;
	    name: string;
	    driver: string;
	    version?: string;
	    host?: string;
	    port?: number;
	    database?: string;
	    username?: string;
	    password?: string;
	    password_policy?: string;
	    save_password: boolean;
	    ssl_mode?: string;
	    socket_path?: string;
	    use_socket: boolean;
	    ssh_enabled: boolean;
	    status_color?: string;
	    advanced_meta?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new ProjectConnection(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.project_id = source["project_id"];
	        this.environment_key = source["environment_key"];
	        this.name = source["name"];
	        this.driver = source["driver"];
	        this.version = source["version"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.database = source["database"];
	        this.username = source["username"];
	        this.password = source["password"];
	        this.password_policy = source["password_policy"];
	        this.save_password = source["save_password"];
	        this.ssl_mode = source["ssl_mode"];
	        this.socket_path = source["socket_path"];
	        this.use_socket = source["use_socket"];
	        this.ssh_enabled = source["ssh_enabled"];
	        this.status_color = source["status_color"];
	        this.advanced_meta = source["advanced_meta"];
	    }
	}
	export class ProjectEnvironment {
	    id: string;
	    project_id: string;
	    key: string;
	    label: string;
	    badge_color?: string;
	    is_protected: boolean;
	    is_read_only: boolean;
	    connection_ref?: string;
	    last_database?: string;
	    last_schema?: string;
	    last_catalog?: string;
	
	    static createFrom(source: any = {}) {
	        return new ProjectEnvironment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.project_id = source["project_id"];
	        this.key = source["key"];
	        this.label = source["label"];
	        this.badge_color = source["badge_color"];
	        this.is_protected = source["is_protected"];
	        this.is_read_only = source["is_read_only"];
	        this.connection_ref = source["connection_ref"];
	        this.last_database = source["last_database"];
	        this.last_schema = source["last_schema"];
	        this.last_catalog = source["last_catalog"];
	    }
	}
	export class Project {
	    id: string;
	    slug: string;
	    name: string;
	    description?: string;
	    color?: string;
	    storage_path?: string;
	    tags?: string[];
	    created_at: string;
	    updated_at: string;
	    last_opened_at?: string;
	    default_environment_key: string;
	    last_active_environment_key?: string;
	    layout_state?: string;
	    environments?: ProjectEnvironment[];
	    connections?: ProjectConnection[];
	    assets?: ProjectAsset[];
	    auto_schema_snapshots?: boolean;
	    auto_commit_on_exit?: boolean;
	    completion_memory?: SQLCompletionMemory;
	
	    static createFrom(source: any = {}) {
	        return new Project(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.slug = source["slug"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.color = source["color"];
	        this.storage_path = source["storage_path"];
	        this.tags = source["tags"];
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	        this.last_opened_at = source["last_opened_at"];
	        this.default_environment_key = source["default_environment_key"];
	        this.last_active_environment_key = source["last_active_environment_key"];
	        this.layout_state = source["layout_state"];
	        this.environments = this.convertValues(source["environments"], ProjectEnvironment);
	        this.connections = this.convertValues(source["connections"], ProjectConnection);
	        this.assets = this.convertValues(source["assets"], ProjectAsset);
	        this.auto_schema_snapshots = source["auto_schema_snapshots"];
	        this.auto_commit_on_exit = source["auto_commit_on_exit"];
	        this.completion_memory = this.convertValues(source["completion_memory"], SQLCompletionMemory);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class ReferencingRowsProbe {
	    Key: string;
	    Schema: string;
	    Table: string;
	    Columns: string[];
	    Keys: string[][];
	
	    static createFrom(source: any = {}) {
	        return new ReferencingRowsProbe(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Key = source["Key"];
	        this.Schema = source["Schema"];
	        this.Table = source["Table"];
	        this.Columns = source["Columns"];
	        this.Keys = source["Keys"];
	    }
	}
	export class ReferencingRowsResult {
	    Key: string;
	    Count: number;
	    HasMore: boolean;
	    Verified: boolean;
	    Error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ReferencingRowsResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Key = source["Key"];
	        this.Count = source["Count"];
	        this.HasMore = source["HasMore"];
	        this.Verified = source["Verified"];
	        this.Error = source["Error"];
	    }
	}
	
	
	export class SavedScript {
	    id: string;
	    project_id: string;
	    connection_name: string;
	    name: string;
	    created_at: string;
	    updated_at: string;
	
	    static createFrom(source: any = {}) {
	        return new SavedScript(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.project_id = source["project_id"];
	        this.connection_name = source["connection_name"];
	        this.name = source["name"];
	        this.created_at = source["created_at"];
	        this.updated_at = source["updated_at"];
	    }
	}
	export class SchemaConstraintSnapshot {
	    name: string;
	    tableName: string;
	    type: string;
	    ddl: string;
	
	    static createFrom(source: any = {}) {
	        return new SchemaConstraintSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.tableName = source["tableName"];
	        this.type = source["type"];
	        this.ddl = source["ddl"];
	    }
	}
	export class SchemaIndexSnapshot {
	    name: string;
	    tableName: string;
	    ddl: string;
	
	    static createFrom(source: any = {}) {
	        return new SchemaIndexSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.tableName = source["tableName"];
	        this.ddl = source["ddl"];
	    }
	}
	export class SchemaMigrationResult {
	    supported: boolean;
	    driver: string;
	    direction: string;
	    sql: string;
	    warnings: string[];
	    unsupportedMessage?: string;
	
	    static createFrom(source: any = {}) {
	        return new SchemaMigrationResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.supported = source["supported"];
	        this.driver = source["driver"];
	        this.direction = source["direction"];
	        this.sql = source["sql"];
	        this.warnings = source["warnings"];
	        this.unsupportedMessage = source["unsupportedMessage"];
	    }
	}
	export class SchemaRoutineSnapshot {
	    name: string;
	    signature: string;
	    ddl: string;
	
	    static createFrom(source: any = {}) {
	        return new SchemaRoutineSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.signature = source["signature"];
	        this.ddl = source["ddl"];
	    }
	}
	export class SchemaViewSnapshot {
	    name: string;
	    ddl: string;
	
	    static createFrom(source: any = {}) {
	        return new SchemaViewSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.ddl = source["ddl"];
	    }
	}
	export class SchemaTableSnapshot {
	    name: string;
	    ddl: string;
	    columns: ColumnDef[];
	
	    static createFrom(source: any = {}) {
	        return new SchemaTableSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.ddl = source["ddl"];
	        this.columns = this.convertValues(source["columns"], ColumnDef);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SchemaSnapshot {
	    driver: string;
	    profileName: string;
	    databaseName: string;
	    schemaName: string;
	    label: string;
	    capturedAt: string;
	    tables: SchemaTableSnapshot[];
	    indexes: SchemaIndexSnapshot[];
	    constraints: SchemaConstraintSnapshot[];
	    views: SchemaViewSnapshot[];
	    routines: SchemaRoutineSnapshot[];
	    normalizedDdl: string;
	    supported: boolean;
	    unsupportedMessage?: string;
	
	    static createFrom(source: any = {}) {
	        return new SchemaSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.driver = source["driver"];
	        this.profileName = source["profileName"];
	        this.databaseName = source["databaseName"];
	        this.schemaName = source["schemaName"];
	        this.label = source["label"];
	        this.capturedAt = source["capturedAt"];
	        this.tables = this.convertValues(source["tables"], SchemaTableSnapshot);
	        this.indexes = this.convertValues(source["indexes"], SchemaIndexSnapshot);
	        this.constraints = this.convertValues(source["constraints"], SchemaConstraintSnapshot);
	        this.views = this.convertValues(source["views"], SchemaViewSnapshot);
	        this.routines = this.convertValues(source["routines"], SchemaRoutineSnapshot);
	        this.normalizedDdl = source["normalizedDdl"];
	        this.supported = source["supported"];
	        this.unsupportedMessage = source["unsupportedMessage"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class TableRelationship {
	    ConstraintName: string;
	    SourceSchema: string;
	    SourceTable: string;
	    SourceColumn: string;
	    TargetSchema: string;
	    TargetTable: string;
	    TargetColumn: string;
	    OnDelete: string;
	    OnUpdate: string;
	    Deferrable?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TableRelationship(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ConstraintName = source["ConstraintName"];
	        this.SourceSchema = source["SourceSchema"];
	        this.SourceTable = source["SourceTable"];
	        this.SourceColumn = source["SourceColumn"];
	        this.TargetSchema = source["TargetSchema"];
	        this.TargetTable = source["TargetTable"];
	        this.TargetColumn = source["TargetColumn"];
	        this.OnDelete = source["OnDelete"];
	        this.OnUpdate = source["OnUpdate"];
	        this.Deferrable = source["Deferrable"];
	    }
	}
	export class Template {
	    id: string;
	    name: string;
	    trigger: string;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new Template(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.trigger = source["trigger"];
	        this.content = source["content"];
	    }
	}
	export class UniqueConstraintInfo {
	    Name: string;
	    Columns: string[];
	
	    static createFrom(source: any = {}) {
	        return new UniqueConstraintInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Columns = source["Columns"];
	    }
	}

}

export namespace plugin {
	
	export class CommandContribution {
	    id: string;
	    title: string;
	    handler_key: string;
	
	    static createFrom(source: any = {}) {
	        return new CommandContribution(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.handler_key = source["handler_key"];
	    }
	}
	export class DataProviderContribution {
	    id: string;
	    resource_types: string[];
	    query_hook: string;
	
	    static createFrom(source: any = {}) {
	        return new DataProviderContribution(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.resource_types = source["resource_types"];
	        this.query_hook = source["query_hook"];
	    }
	}
	export class Manifest {
	    id: string;
	    version: string;
	    min_app_version: string;
	    capabilities: string[];
	
	    static createFrom(source: any = {}) {
	        return new Manifest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.version = source["version"];
	        this.min_app_version = source["min_app_version"];
	        this.capabilities = source["capabilities"];
	    }
	}
	export class Contribution {
	    manifest: Manifest;
	    commands?: CommandContribution[];
	    data_providers?: DataProviderContribution[];
	    metadata?: Record<string, string>;
	
	    static createFrom(source: any = {}) {
	        return new Contribution(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.manifest = this.convertValues(source["manifest"], Manifest);
	        this.commands = this.convertValues(source["commands"], CommandContribution);
	        this.data_providers = this.convertValues(source["data_providers"], DataProviderContribution);
	        this.metadata = source["metadata"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	

}

export namespace querystat {
	
	export class HourlyBucket {
	    hour: string;
	    count: number;
	    error_count: number;
	    avg_ms: number;
	
	    static createFrom(source: any = {}) {
	        return new HourlyBucket(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hour = source["hour"];
	        this.count = source["count"];
	        this.error_count = source["error_count"];
	        this.avg_ms = source["avg_ms"];
	    }
	}
	export class QueryPattern {
	    normalized_sql: string;
	    exec_count: number;
	    error_count: number;
	    avg_ms: number;
	    p95_ms: number;
	    max_ms: number;
	    total_ms: number;
	    last_duration_ms: number;
	    last_seen_at: string;
	
	    static createFrom(source: any = {}) {
	        return new QueryPattern(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.normalized_sql = source["normalized_sql"];
	        this.exec_count = source["exec_count"];
	        this.error_count = source["error_count"];
	        this.avg_ms = source["avg_ms"];
	        this.p95_ms = source["p95_ms"];
	        this.max_ms = source["max_ms"];
	        this.total_ms = source["total_ms"];
	        this.last_duration_ms = source["last_duration_ms"];
	        this.last_seen_at = source["last_seen_at"];
	    }
	}
	export class StatFilter {
	    profile: string;
	    driver: string;
	    window_mins: number;
	    limit: number;
	
	    static createFrom(source: any = {}) {
	        return new StatFilter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.profile = source["profile"];
	        this.driver = source["driver"];
	        this.window_mins = source["window_mins"];
	        this.limit = source["limit"];
	    }
	}
	export class StatReport {
	    total_execs: number;
	    error_rate: number;
	    avg_duration_ms: number;
	    p95_duration_ms: number;
	    top_impact: QueryPattern[];
	    top_frequent: QueryPattern[];
	    hourly_buckets: HourlyBucket[];
	    profile_name: string;
	    window_mins: number;
	
	    static createFrom(source: any = {}) {
	        return new StatReport(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total_execs = source["total_execs"];
	        this.error_rate = source["error_rate"];
	        this.avg_duration_ms = source["avg_duration_ms"];
	        this.p95_duration_ms = source["p95_duration_ms"];
	        this.top_impact = this.convertValues(source["top_impact"], QueryPattern);
	        this.top_frequent = this.convertValues(source["top_frequent"], QueryPattern);
	        this.hourly_buckets = this.convertValues(source["hourly_buckets"], HourlyBucket);
	        this.profile_name = source["profile_name"];
	        this.window_mins = source["window_mins"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace utils {
	
	export class SQLTokenStyle {
	    color?: string;
	    weight?: string;
	    italic?: boolean;
	    bold?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SQLTokenStyle(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.color = source["color"];
	        this.weight = source["weight"];
	        this.italic = source["italic"];
	        this.bold = source["bold"];
	    }
	}
	export class SQLEditorStyle {
	    light?: Record<string, SQLTokenStyle>;
	    dark?: Record<string, SQLTokenStyle>;
	    schema_highlight?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SQLEditorStyle(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.light = this.convertValues(source["light"], SQLTokenStyle, true);
	        this.dark = this.convertValues(source["dark"], SQLTokenStyle, true);
	        this.schema_highlight = source["schema_highlight"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class SQLFormatPrefs {
	    keyword_case?: string;
	    indent_size?: number;
	    use_tabs?: boolean;
	    comma_position?: string;
	    and_or_position?: string;
	
	    static createFrom(source: any = {}) {
	        return new SQLFormatPrefs(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.keyword_case = source["keyword_case"];
	        this.indent_size = source["indent_size"];
	        this.use_tabs = source["use_tabs"];
	        this.comma_position = source["comma_position"];
	        this.and_or_position = source["and_or_position"];
	    }
	}
	export class ShortcutRule {
	    id: string;
	    command_id: string;
	    binding: string;
	    when: string;
	    source: string;
	    order: number;
	
	    static createFrom(source: any = {}) {
	        return new ShortcutRule(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.command_id = source["command_id"];
	        this.binding = source["binding"];
	        this.when = source["when"];
	        this.source = source["source"];
	        this.order = source["order"];
	    }
	}
	export class Preferences {
	    theme: string;
	    font_size: number;
	    font_family: string;
	    mono_family: string;
	    theme_preset_light: string;
	    theme_preset_dark: string;
	    accent_color: string;
	    density: string;
	    chunk_size: number;
	    toast_placement: string;
	    query_timeout: number;
	    connect_timeout: number;
	    schema_timeout: number;
	    view_mode: boolean;
	    risk_highlight: boolean;
	    minimap: boolean;
	    editor_focus_mode: boolean;
	    editor_focus_width: number;
	    shortcuts: Record<string, string>;
	    shortcut_rules: ShortcutRule[];
	    environment_safety_levels?: Record<string, string>;
	    launch_count?: number;
	    max_pooled_connections?: number;
	    feedback_prompted_at?: string;
	    error_lens?: boolean;
	    sql_format: SQLFormatPrefs;
	    sql_editor_style: SQLEditorStyle;
	
	    static createFrom(source: any = {}) {
	        return new Preferences(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.font_size = source["font_size"];
	        this.font_family = source["font_family"];
	        this.mono_family = source["mono_family"];
	        this.theme_preset_light = source["theme_preset_light"];
	        this.theme_preset_dark = source["theme_preset_dark"];
	        this.accent_color = source["accent_color"];
	        this.density = source["density"];
	        this.chunk_size = source["chunk_size"];
	        this.toast_placement = source["toast_placement"];
	        this.query_timeout = source["query_timeout"];
	        this.connect_timeout = source["connect_timeout"];
	        this.schema_timeout = source["schema_timeout"];
	        this.view_mode = source["view_mode"];
	        this.risk_highlight = source["risk_highlight"];
	        this.minimap = source["minimap"];
	        this.editor_focus_mode = source["editor_focus_mode"];
	        this.editor_focus_width = source["editor_focus_width"];
	        this.shortcuts = source["shortcuts"];
	        this.shortcut_rules = this.convertValues(source["shortcut_rules"], ShortcutRule);
	        this.environment_safety_levels = source["environment_safety_levels"];
	        this.launch_count = source["launch_count"];
	        this.max_pooled_connections = source["max_pooled_connections"];
	        this.feedback_prompted_at = source["feedback_prompted_at"];
	        this.error_lens = source["error_lens"];
	        this.sql_format = this.convertValues(source["sql_format"], SQLFormatPrefs);
	        this.sql_editor_style = this.convertValues(source["sql_editor_style"], SQLEditorStyle);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	

}

