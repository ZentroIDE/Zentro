// SPDX-License-Identifier: GPL-3.0-only

import type { StoreScope } from '../../types/project';

export type { StoreScope };

export interface UserInfo {
    id: string;
    email: string;
    name: string;
    avatarUrl?: string;
}

export interface AuthSession {
    user: UserInfo;
    token: string;
    expiresAt: number;
    permissions: string[];
    scope: StoreScope;
    scopeId?: string;
}

export interface AuthResult {
    success: boolean;
    session?: AuthSession;
    error?: string;
}

export interface AuthProvider {
    readonly id: string;
    readonly label: string;
    login(credentials?: Record<string, unknown>): Promise<AuthResult>;
    logout(): Promise<void>;
    getSession(): Promise<AuthSession | null>;
    refreshSession(): Promise<AuthSession | null>;
}
