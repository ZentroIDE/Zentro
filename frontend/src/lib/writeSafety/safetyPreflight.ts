// SPDX-License-Identifier: GPL-3.0-only

export interface QueryAuditMeta {
    reason?: string;
    riskLevel?: string;
    previewRowCount?: number;
    usedProtectionLayers?: string[];
    snapshotRef?: string;
}

export interface ProductionWriteUnlockState {
    environmentKey: string;
    unlocked: boolean;
    unlockUntil?: string;
}

export interface QueryPreviewResult {
    supported: boolean;
    affectedRowCount?: number;
    countKnown: boolean;
    columns?: string[];
    rows?: string[][];
    fallbackReason?: string;
}

import { RiskLevel } from '../../lib/enums';

export { RiskLevel };

export interface QueryPreflightStatement {
    statementText: string;
    operation: string;
    riskLevel: RiskLevel | string;
    hasWhere: boolean;
    destructive: boolean;
    previewSupported: boolean;
    typeToConfirmText?: string;
}

export interface QueryPreflightResult {
    statements: QueryPreflightStatement[];
    riskLevel: RiskLevel | string;
    requiresPro: boolean;
    requiresProductionUnlock: boolean;
    productionUnlock: ProductionWriteUnlockState;
    requiresTypeToConfirm: boolean;
    typeToConfirmText?: string;
    requiresCooldown: boolean;
    cooldownSeconds?: number;
    requiresReason: boolean;
    affectedRowsPreview: QueryPreviewResult;
    usedProtectionLayers?: string[];
    transactionSuggested: boolean;
    snapshotRequired: boolean;
}

export interface WritePreviewPage {
    columns: string[];
    rows: string[][];
    hasMore: boolean;
    totalCount: number;
    tableName?: string;
}

export interface OpenWritePreviewResult {
    previewSessionId: string;
    previewTabQueryLabel: string;
    initialResultMeta: WritePreviewPage;
}
