// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
    analyzeOperationRisk,
    analyzeSqlRisk,
    evaluateWriteSafetyDecision,
    WriteOperationKind,
} from './writeSafety';

describe('writeSafety analyzer', () => {
    it('splits statements and ignores comments/strings', () => {
        const analysis = analyzeSqlRisk(`
            -- UPDATE users SET name = 'x'
            UPDATE users SET note = 'where token';
            SELECT 1;
        `);
        expect(analysis.hasWrite).toBe(true);
        expect(analysis.hasUpdateNoWhere).toBe(true);
        expect(analysis.operations).toContain(WriteOperationKind.UPDATE);
    });

    it('detects destructive operations and no-where delete', () => {
        const analysis = analyzeSqlRisk(
            'DELETE FROM users; ALTER TABLE users ADD COLUMN bio TEXT;',
        );
        expect(analysis.hasDeleteNoWhere).toBe(true);
        expect(analysis.hasDestructive).toBe(true);
        expect(analysis.operations).toContain('delete');
        expect(analysis.operations).toContain('alter');
    });
});

describe('writeSafety decision', () => {
    it('requires strong (typed) confirmation for no-where update in strict mode, not a dead-end block', () => {
        // Strict mode raises the bar to a typed confirmation rather than an
        // unconditional block — the backend's validateStrictWriteSafety has a
        // matching bypass (canBypassStrictWriteSafety) once that confirmation
        // is recorded, so a hard "block" here would leave no way to proceed.
        const decision = evaluateWriteSafetyDecision({
            analysis: analyzeSqlRisk("UPDATE users SET name = 'admin';"),
            safetyLevel: 'strict',
            environmentKey: 'dev',
            actionLabel: 'Run Query',
        });
        expect(decision.action).toBe('confirm');
        expect(decision.requiresDoubleConfirm).toBe(true);
    });

    it('requires confirmation in balanced mode for no-where update', () => {
        const decision = evaluateWriteSafetyDecision({
            analysis: analyzeSqlRisk("UPDATE users SET name = 'admin';"),
            safetyLevel: 'balanced',
            environmentKey: 'dev',
            actionLabel: 'Run Query',
        });
        expect(decision.action).toBe('confirm');
        expect(decision.requiresDoubleConfirm).toBe(false);
    });

    it('requires double confirmation on production destructive operations', () => {
        const decision = evaluateWriteSafetyDecision({
            analysis: analyzeOperationRisk([WriteOperationKind.DROP]),
            safetyLevel: 'strict',
            environmentKey: 'pro',
            actionLabel: 'Drop Table',
        });
        expect(decision.action).toBe('confirm');
        expect(decision.requiresDoubleConfirm).toBe(true);
    });

    it('requires single confirmation for non-threshold destructive operations', () => {
        const decision = evaluateWriteSafetyDecision({
            analysis: analyzeOperationRisk([WriteOperationKind.DROP]),
            safetyLevel: 'relaxed',
            environmentKey: 'dev',
            actionLabel: 'Drop Table',
        });
        expect(decision.action).toBe('confirm');
        expect(decision.requiresDoubleConfirm).toBe(false);
    });

    it('derives strong confirmation from the safety level, not the environment', () => {
        const balancedStaging = evaluateWriteSafetyDecision({
            analysis: analyzeOperationRisk([WriteOperationKind.DROP]),
            safetyLevel: 'balanced',
            environmentKey: 'sta',
            actionLabel: 'Drop Table',
        });
        expect(balancedStaging.action).toBe('confirm');
        expect(balancedStaging.requiresDoubleConfirm).toBe(false);

        const strictDev = evaluateWriteSafetyDecision({
            analysis: analyzeOperationRisk([WriteOperationKind.DROP]),
            safetyLevel: 'strict',
            environmentKey: 'dev',
            actionLabel: 'Drop Table',
        });
        expect(strictDev.action).toBe('confirm');
        expect(strictDev.requiresDoubleConfirm).toBe(true);
    });
});
