// SPDX-License-Identifier: GPL-3.0-only

import { SAFETY_LEVEL } from '../constants';
import { ENVIRONMENT_KEY } from '../../lib/constants';
import {
    WriteOperationKind,
    WriteSafetyAction,
    WriteSafetySeverity,
    RiskLevel,
} from '../../lib/enums';
import type { SafetyLevel } from '../../types/policy';
import type { QueryPreflightResult } from './safetyPreflight';

export { WriteOperationKind, WriteSafetyAction, WriteSafetySeverity };

export interface StatementRiskAnalysis {
    statement: string;
    operation: WriteOperationKind;
    hasWhere: boolean;
    destructive: boolean;
    updateNoWhere: boolean;
    deleteNoWhere: boolean;
}

export interface SqlRiskAnalysis {
    statements: StatementRiskAnalysis[];
    operations: WriteOperationKind[];
    hasWrite: boolean;
    hasDestructive: boolean;
    hasUpdateNoWhere: boolean;
    hasDeleteNoWhere: boolean;
}

export interface OperationRiskAnalysis {
    operations: WriteOperationKind[];
    hasWrite: boolean;
    hasDestructive: boolean;
    hasUpdateNoWhere: boolean;
    hasDeleteNoWhere: boolean;
}

export interface WriteSafetyDecision {
    action: WriteSafetyAction;
    title: string;
    message: string;
    description: string;
    confirmLabel: string;
    requiresDoubleConfirm: boolean;
    severity: WriteSafetySeverity;
}

const WRITE_OPS = new Set<WriteOperationKind>([
    WriteOperationKind.UPDATE,
    WriteOperationKind.DELETE,
    WriteOperationKind.ALTER,
    WriteOperationKind.DROP,
    WriteOperationKind.TRUNCATE,
    WriteOperationKind.MERGE,
    WriteOperationKind.REPLACE,
    WriteOperationKind.INSERT,
    WriteOperationKind.CREATE,
    WriteOperationKind.OTHER_WRITE,
]);

const DESTRUCTIVE_OPS = new Set<WriteOperationKind>([
    WriteOperationKind.UPDATE,
    WriteOperationKind.DELETE,
    WriteOperationKind.ALTER,
    WriteOperationKind.DROP,
    WriteOperationKind.TRUNCATE,
    WriteOperationKind.MERGE,
    WriteOperationKind.REPLACE,
]);

const KEYWORD_OP_MAP: Record<string, WriteOperationKind> = {
    update: WriteOperationKind.UPDATE,
    delete: WriteOperationKind.DELETE,
    alter: WriteOperationKind.ALTER,
    drop: WriteOperationKind.DROP,
    truncate: WriteOperationKind.TRUNCATE,
    merge: WriteOperationKind.MERGE,
    replace: WriteOperationKind.REPLACE,
    insert: WriteOperationKind.INSERT,
    create: WriteOperationKind.CREATE,
    select: WriteOperationKind.READ,
    show: WriteOperationKind.READ,
    explain: WriteOperationKind.READ,
    describe: WriteOperationKind.READ,
    desc: WriteOperationKind.READ,
};

const OPERATION_LOOKUP_ORDER = [
    'update',
    'delete',
    'alter',
    'drop',
    'truncate',
    'merge',
    'replace',
    'insert',
    'create',
    'select',
    'show',
    'explain',
    'describe',
    'desc',
];

export function splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inBracket = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i];
        const next = i + 1 < sql.length ? sql[i + 1] : '';

        if (inLineComment) {
            current += ch;
            if (ch === '\n') {
                inLineComment = false;
            }
            continue;
        }

        if (inBlockComment) {
            current += ch;
            if (ch === '*' && next === '/') {
                current += next;
                i++;
                inBlockComment = false;
            }
            continue;
        }

        if (!inSingle && !inDouble && !inBacktick && !inBracket) {
            if (ch === '-' && next === '-') {
                current += ch + next;
                i++;
                inLineComment = true;
                continue;
            }
            if (ch === '/' && next === '*') {
                current += ch + next;
                i++;
                inBlockComment = true;
                continue;
            }
        }

        if (ch === "'" && !inDouble && !inBacktick && !inBracket) {
            current += ch;
            if (inSingle && next === "'") {
                current += next;
                i++;
            } else {
                inSingle = !inSingle;
            }
            continue;
        }

        if (ch === '"' && !inSingle && !inBacktick && !inBracket) {
            current += ch;
            if (inDouble && next === '"') {
                current += next;
                i++;
            } else {
                inDouble = !inDouble;
            }
            continue;
        }

        if (ch === '`' && !inSingle && !inDouble && !inBracket) {
            current += ch;
            inBacktick = !inBacktick;
            continue;
        }

        if (ch === '[' && !inSingle && !inDouble && !inBacktick) {
            inBracket = true;
            current += ch;
            continue;
        }

        if (ch === ']' && inBracket) {
            inBracket = false;
            current += ch;
            continue;
        }

        if (ch === ';' && !inSingle && !inDouble && !inBacktick && !inBracket) {
            const statement = current.trim();
            if (statement) {
                statements.push(statement);
            }
            current = '';
            continue;
        }

        current += ch;
    }

    const finalStatement = current.trim();
    if (finalStatement) {
        statements.push(finalStatement);
    }

    return statements;
}

function tokenizeSql(sql: string): string[] {
    const tokens: string[] = [];
    let word = '';
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inBracket = false;
    let inLineComment = false;
    let inBlockComment = false;

    const flushWord = () => {
        if (!word) return;
        tokens.push(word.toLowerCase());
        word = '';
    };

    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i];
        const next = i + 1 < sql.length ? sql[i + 1] : '';

        if (inLineComment) {
            if (ch === '\n') {
                inLineComment = false;
            }
            continue;
        }

        if (inBlockComment) {
            if (ch === '*' && next === '/') {
                i++;
                inBlockComment = false;
            }
            continue;
        }

        if (!inSingle && !inDouble && !inBacktick && !inBracket) {
            if (ch === '-' && next === '-') {
                flushWord();
                i++;
                inLineComment = true;
                continue;
            }
            if (ch === '/' && next === '*') {
                flushWord();
                i++;
                inBlockComment = true;
                continue;
            }
        }

        if (ch === "'" && !inDouble && !inBacktick && !inBracket) {
            flushWord();
            if (inSingle && next === "'") {
                i++;
            } else {
                inSingle = !inSingle;
            }
            continue;
        }

        if (ch === '"' && !inSingle && !inBacktick && !inBracket) {
            flushWord();
            if (inDouble && next === '"') {
                i++;
            } else {
                inDouble = !inDouble;
            }
            continue;
        }

        if (ch === '`' && !inSingle && !inDouble && !inBracket) {
            flushWord();
            inBacktick = !inBacktick;
            continue;
        }

        if (ch === '[' && !inSingle && !inDouble && !inBacktick) {
            flushWord();
            inBracket = true;
            continue;
        }

        if (ch === ']' && inBracket) {
            flushWord();
            inBracket = false;
            continue;
        }

        if (inSingle || inDouble || inBacktick || inBracket) {
            continue;
        }

        if (/[a-zA-Z_]/.test(ch)) {
            word += ch;
            continue;
        }

        if (/[0-9$]/.test(ch) && word) {
            word += ch;
            continue;
        }

        flushWord();
    }

    flushWord();
    return tokens;
}

function resolveStatementOperation(tokens: string[]): WriteOperationKind {
    if (tokens.length === 0) return WriteOperationKind.UNKNOWN;

    let candidate = tokens[0];
    if (candidate === 'with') {
        candidate =
            OPERATION_LOOKUP_ORDER.find(keyword => tokens.includes(keyword)) ||
            WriteOperationKind.UNKNOWN;
    }

    return KEYWORD_OP_MAP[candidate] || WriteOperationKind.UNKNOWN;
}

export function analyzeStatementRisk(statement: string): StatementRiskAnalysis {
    const trimmed = statement.trim();
    const tokens = tokenizeSql(trimmed);
    const operation = resolveStatementOperation(tokens);
    const hasWhere = tokens.includes('where');
    const destructive = DESTRUCTIVE_OPS.has(operation);
    const updateNoWhere = operation === WriteOperationKind.UPDATE && !hasWhere;
    const deleteNoWhere = operation === WriteOperationKind.DELETE && !hasWhere;

    return {
        statement: trimmed,
        operation,
        hasWhere,
        destructive,
        updateNoWhere,
        deleteNoWhere,
    };
}

export function analyzeSqlRisk(sql: string): SqlRiskAnalysis {
    const statements = splitSqlStatements(sql);
    const targets = statements.length > 0 ? statements : [sql];
    const analyses = targets
        .map(statement => analyzeStatementRisk(statement))
        .filter(result => result.statement.length > 0);

    const opSet = new Set<WriteOperationKind>();
    analyses.forEach(item => {
        if (item.operation !== WriteOperationKind.UNKNOWN) {
            opSet.add(item.operation);
        }
    });

    return {
        statements: analyses,
        operations: Array.from(opSet),
        hasWrite: analyses.some(item => WRITE_OPS.has(item.operation)),
        hasDestructive: analyses.some(item => item.destructive),
        hasUpdateNoWhere: analyses.some(item => item.updateNoWhere),
        hasDeleteNoWhere: analyses.some(item => item.deleteNoWhere),
    };
}

export function analyzeOperationRisk(operations: WriteOperationKind[]): OperationRiskAnalysis {
    const filtered = operations.filter(
        operation =>
            operation !== WriteOperationKind.UNKNOWN && operation !== WriteOperationKind.READ,
    );
    const set = new Set<WriteOperationKind>(filtered);

    return {
        operations: Array.from(set),
        hasWrite: filtered.some(operation => WRITE_OPS.has(operation)),
        hasDestructive: filtered.some(operation => DESTRUCTIVE_OPS.has(operation)),
        hasUpdateNoWhere: false,
        hasDeleteNoWhere: false,
    };
}

function formatOperations(operations: WriteOperationKind[]): string {
    const labels = operations
        .filter(
            operation =>
                operation !== WriteOperationKind.UNKNOWN && operation !== WriteOperationKind.READ,
        )
        .map(operation => operation.toUpperCase());
    return labels.length > 0 ? labels.join(', ') : 'WRITE';
}

export function evaluateWriteSafetyDecision(params: {
    analysis: OperationRiskAnalysis | SqlRiskAnalysis;
    safetyLevel: SafetyLevel;
    environmentKey?: string | null;
    actionLabel?: string;
}): WriteSafetyDecision {
    const { analysis, safetyLevel, actionLabel = 'Run SQL' } = params;
    const noWhereDetected = analysis.hasUpdateNoWhere || analysis.hasDeleteNoWhere;
    // Strong Confirmation derives from Safety Level — never its own setting (ADR-0008).
    const requiresStrongConfirm =
        (analysis.hasDestructive || noWhereDetected) && safetyLevel === SAFETY_LEVEL.STRICT;
    const operationSummary = formatOperations(analysis.operations);

    if (!analysis.hasWrite) {
        return {
            action: WriteSafetyAction.ALLOW,
            title: 'No Write Risk',
            message: 'No write risk detected.',
            description: 'This operation is read-only.',
            confirmLabel: 'Continue',
            requiresDoubleConfirm: false,
            severity: WriteSafetySeverity.PRIMARY,
        };
    }

    if (safetyLevel === SAFETY_LEVEL.STRICT && noWhereDetected) {
        // Strict mode doesn't forbid this outright — it raises the bar to a
        // typed confirmation (mirrors the backend's strong-confirmation
        // bypass in validateStrictWriteSafety). An unconditional block here
        // left users with a bare backend error and no way to proceed.
        return {
            action: WriteSafetyAction.CONFIRM,
            title: 'Strong Confirmation Required',
            message: 'UPDATE/DELETE without WHERE requires strong confirmation in strict mode.',
            description: `${actionLabel} includes SQL without WHERE. Strict safety requires typed confirmation before this can run.`,
            confirmLabel: 'Continue',
            requiresDoubleConfirm: true,
            severity: WriteSafetySeverity.DANGER,
        };
    }

    if (noWhereDetected) {
        return {
            action: WriteSafetyAction.CONFIRM,
            title: 'No-WHERE Write Detected',
            message: 'UPDATE/DELETE without WHERE may affect many rows.',
            description: `${actionLabel} includes SQL without WHERE. Review carefully before continuing.`,
            confirmLabel: requiresStrongConfirm ? 'Continue' : 'Run Anyway',
            requiresDoubleConfirm: requiresStrongConfirm,
            severity: WriteSafetySeverity.DANGER,
        };
    }

    if (analysis.hasDestructive) {
        return {
            action: WriteSafetyAction.CONFIRM,
            title: 'Confirm Destructive Write',
            message: `Destructive operation detected (${operationSummary}).`,
            description: `${actionLabel} includes destructive SQL and requires explicit confirmation.`,
            confirmLabel: requiresStrongConfirm ? 'Continue' : 'Run',
            requiresDoubleConfirm: requiresStrongConfirm,
            severity: WriteSafetySeverity.DANGER,
        };
    }

    if (analysis.hasWrite && safetyLevel !== SAFETY_LEVEL.RELAXED) {
        return {
            action: WriteSafetyAction.CONFIRM,
            title: 'Confirm Write Operation',
            message: 'Write operation detected.',
            description: `${actionLabel} will modify data.`,
            confirmLabel: 'Run',
            requiresDoubleConfirm: false,
            severity: WriteSafetySeverity.PRIMARY,
        };
    }

    return {
        action: WriteSafetyAction.ALLOW,
        title: 'Write Allowed',
        message: 'Write operation allowed.',
        description: 'The current safety level allows this action.',
        confirmLabel: 'Run',
        requiresDoubleConfirm: false,
        severity: WriteSafetySeverity.PRIMARY,
    };
}

export type SafetyFeatureAccess = {
    productionUnlock: boolean;
    typeToConfirm: boolean;
    cooldown: boolean;
    reasonAudit: boolean;
};

function isProductionEnvironment(environmentKey?: string | null): boolean {
    return environmentKey === ENVIRONMENT_KEY.PRODUCTION;
}

export function buildOperationPreflight(
    analysis: OperationRiskAnalysis,
    environmentKey: string | null | undefined,
    features: SafetyFeatureAccess,
): QueryPreflightResult | null {
    if (!analysis.hasWrite) return null;
    const riskLevel = analysis.hasDestructive ? RiskLevel.DANGER : RiskLevel.CAUTION;
    const requiresProd =
        isProductionEnvironment(environmentKey) &&
        analysis.hasDestructive &&
        !features.productionUnlock;
    return {
        statements: [],
        riskLevel,
        requiresPro: requiresProd,
        requiresProductionUnlock:
            isProductionEnvironment(environmentKey) &&
            analysis.hasWrite &&
            features.productionUnlock,
        productionUnlock: {
            environmentKey: environmentKey || '',
            unlocked: false,
        },
        requiresTypeToConfirm:
            isProductionEnvironment(environmentKey) &&
            analysis.hasDestructive &&
            features.typeToConfirm,
        typeToConfirmText: analysis.operations[0]?.toUpperCase(),
        requiresCooldown:
            isProductionEnvironment(environmentKey) && analysis.hasDestructive && features.cooldown,
        cooldownSeconds: 3,
        requiresReason:
            isProductionEnvironment(environmentKey) &&
            analysis.hasDestructive &&
            features.reasonAudit,
        affectedRowsPreview: {
            supported: false,
            countKnown: false,
        },
        usedProtectionLayers: [],
        transactionSuggested: false,
        snapshotRequired: false,
    };
}
