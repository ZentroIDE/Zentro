// SPDX-License-Identifier: GPL-3.0-only

import type { AuthProvider, AuthSession } from '../features/auth/authContracts';
import { APP_API_URL } from '../lib/appUrls';
import {
    createApiGateway,
    type ApiGateway,
    type ApiMode,
    type CreateApiGatewayOptions,
} from './apiGateway';

let activeGateway: ApiGateway = createApiGateway();

export function getApiGateway(): ApiGateway {
    return activeGateway;
}

export function setApiGateway(gateway: ApiGateway): void {
    activeGateway = gateway;
}

export function resetApiGateway(): void {
    activeGateway = createApiGateway();
}

export function resolveApiGatewayMode(session: AuthSession | null | undefined): ApiMode {
    if (!session) return 'local';
    if (session.scope === 'enterprise') return 'enterprise';
    if (session.scope === 'team') return 'team';
    return 'local';
}

export function configureApiGateway(options: {
    provider?: AuthProvider | null;
    session?: AuthSession | null;
    restBaseUrl?: string;
    fetchImpl?: typeof fetch;
}): ApiGateway {
    const mode = resolveApiGatewayMode(options.session);
    const restBaseUrl = options.restBaseUrl ?? APP_API_URL;

    const gatewayOptions: CreateApiGatewayOptions =
        mode === 'local' || !restBaseUrl
            ? { mode: 'local' }
            : {
                  mode,
                  provider: options.provider ?? undefined,
                  restBaseUrl,
                  fetchImpl: options.fetchImpl,
              };

    activeGateway = createApiGateway(gatewayOptions);
    return activeGateway;
}
