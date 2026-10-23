// SPDX-License-Identifier: GPL-3.0-only

import type { AuthProvider } from '../../../features/auth/authContracts';

export interface RestHttpClientOptions {
    baseUrl: string;
    provider?: AuthProvider;
    fetchImpl?: typeof fetch;
}

export class RestHttpClient {
    private readonly baseUrl: string;
    private readonly provider?: AuthProvider;
    private readonly fetchImpl: typeof fetch;

    constructor(options: RestHttpClientOptions) {
        this.baseUrl = options.baseUrl.replace(/\/+$/, '');
        this.provider = options.provider;
        this.fetchImpl = options.fetchImpl ?? fetch;
    }

    async call<TResponse>(path: string, body?: Record<string, unknown>): Promise<TResponse> {
        const session = await this.provider?.getSession();
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
            },
            body: JSON.stringify(body ?? {}),
        });

        if (!response.ok) {
            throw new Error(`REST gateway request failed: ${response.status}`);
        }

        if (response.status === 204) {
            return undefined as TResponse;
        }

        return (await response.json()) as TResponse;
    }
}
