// SPDX-License-Identifier: GPL-3.0-only

import type { AuthProvider } from '../../../features/auth/authContracts';
import type {
    ApiGateway,
    ApiMode,
    ConnectionAdapter,
    QueryAdapter,
    SchemaAdapter,
    ProjectAdapter,
    SecurityAdapter,
    SettingsAdapter,
    SourceControlAdapter,
    AuditAdapter,
    GitTrackingAdapter,
    TemplateAdapter,
    ScriptAdapter,
    BookmarkAdapter,
    ImageColumnAdapter,
    LicenseAdapter,
    PluginAdapter,
    QueryStatsAdapter,
    JobAdapter,
    ImportAdapter,
    ServerSessionAdapter,
    AIAdapter,
    StatsAdapter,
    TerminalAdapter,
} from '../contracts';
import { RestHttpClient } from './httpClient';
import { createConnectionRestAdapter } from './connection';
import { createQueryRestAdapter } from './query';
import { createSchemaRestAdapter } from './schema';
import { createProjectRestAdapter } from './project';
import { createSecurityRestAdapter } from './security';
import { createSettingsRestAdapter } from './settings';
import { createSourceControlRestAdapter } from './sourceControl';
import { createAuditRestAdapter } from './audit';
import { createGitTrackingRestAdapter } from './gitTracking';
import { createTemplateRestAdapter } from './template';
import { createScriptRestAdapter } from './script';
import { createBookmarkRestAdapter } from './bookmark';
import { createImageColumnRestAdapter } from './imageColumn';
import { createLicenseRestAdapter } from './license';
import { createPluginRestAdapter } from './plugin';
import { createQueryStatsRestAdapter } from './queryStats';
import { createJobRestAdapter } from './job';
import { createImportRestAdapter } from './import';
import { createServerSessionRestAdapter } from './serverSession';
import { createAIRestAdapter } from './ai';
import { createStatsRestAdapter } from './stats';
import { createTerminalRestAdapter } from './terminal';

export { RestHttpClient } from './httpClient';
export type { RestHttpClientOptions } from './httpClient';

// REST-backed ApiGateway for team/enterprise mode. Each domain adapter lives
// in its own module; this class only wires them to one shared HTTP client.
export class RestApiGateway implements ApiGateway {
    readonly mode: ApiMode;
    readonly connection: ConnectionAdapter;
    readonly query: QueryAdapter;
    readonly schema: SchemaAdapter;
    readonly project: ProjectAdapter;
    readonly security: SecurityAdapter;
    readonly settings: SettingsAdapter;
    readonly sourceControl: SourceControlAdapter;
    readonly audit: AuditAdapter;
    readonly gitTracking: GitTrackingAdapter;
    readonly template: TemplateAdapter;
    readonly script: ScriptAdapter;
    readonly bookmark: BookmarkAdapter;
    readonly imageColumn: ImageColumnAdapter;
    readonly license: LicenseAdapter;
    readonly plugin: PluginAdapter;
    readonly queryStats: QueryStatsAdapter;
    readonly job: JobAdapter;
    readonly dataImport: ImportAdapter;
    readonly serverSession: ServerSessionAdapter;
    readonly ai: AIAdapter;
    readonly stats: StatsAdapter;
    readonly terminal: TerminalAdapter;

    constructor(
        baseUrl: string,
        provider?: AuthProvider,
        fetchImpl?: typeof fetch,
        mode: ApiMode = 'team',
    ) {
        this.mode = mode;
        const client = new RestHttpClient({ baseUrl, provider, fetchImpl });
        this.connection = createConnectionRestAdapter(client);
        this.query = createQueryRestAdapter(client);
        this.schema = createSchemaRestAdapter(client);
        this.project = createProjectRestAdapter(client);
        this.security = createSecurityRestAdapter(client);
        this.settings = createSettingsRestAdapter(client);
        this.sourceControl = createSourceControlRestAdapter(client);
        this.audit = createAuditRestAdapter(client);
        this.gitTracking = createGitTrackingRestAdapter(client);
        this.template = createTemplateRestAdapter(client);
        this.script = createScriptRestAdapter(client);
        this.bookmark = createBookmarkRestAdapter(client);
        this.imageColumn = createImageColumnRestAdapter(client);
        this.license = createLicenseRestAdapter(client);
        this.plugin = createPluginRestAdapter(client);
        this.queryStats = createQueryStatsRestAdapter(client);
        this.job = createJobRestAdapter(client);
        this.dataImport = createImportRestAdapter(client);
        this.serverSession = createServerSessionRestAdapter(client);
        this.ai = createAIRestAdapter();
        this.stats = createStatsRestAdapter();
        this.terminal = createTerminalRestAdapter();
    }
}
