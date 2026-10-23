// SPDX-License-Identifier: GPL-3.0-only

// API gateway seam: contracts live in app-api/contracts, the Wails-backed
// gateway in app-api/wailsApiGateway, and the REST-backed gateway (team/
// enterprise) in app-api/rest. This module re-exports the public surface and
// owns the factory, so consumer import paths are unchanged.
import type { AuthProvider } from '../features/auth/authContracts';
import type { ApiGateway, ApiMode } from './app-api/contracts';
import { RestApiGateway } from './app-api/rest';
import { WailsApiGateway } from './app-api/wailsApiGateway';

export type {
    ApiGateway,
    ApiMode,
    AuditAdapter,
    BookmarkAdapter,
    ConnectionAdapter,
    GitTrackingAdapter,
    LicenseAdapter,
    PluginAdapter,
    ProjectAdapter,
    QueryAdapter,
    QueryStatsAdapter,
    SchemaAdapter,
    ScriptAdapter,
    SecurityAdapter,
    SettingsAdapter,
    SourceControlAdapter,
    TemplateAdapter,
} from './app-api/contracts';
export { RestApiGateway } from './app-api/rest';
export { WailsApiGateway } from './app-api/wailsApiGateway';

export interface CreateApiGatewayOptions {
    mode?: ApiMode;
    provider?: AuthProvider;
    restBaseUrl?: string;
    fetchImpl?: typeof fetch;
}

export function createApiGateway(options: CreateApiGatewayOptions = {}): ApiGateway {
    if (options.mode === 'team' || options.mode === 'enterprise') {
        if (!options.restBaseUrl) {
            throw new Error('restBaseUrl is required for non-local api gateways');
        }
        return new RestApiGateway(
            options.restBaseUrl,
            options.provider,
            options.fetchImpl,
            options.mode,
        );
    }
    return new WailsApiGateway();
}
