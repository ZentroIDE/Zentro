// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { models } from '../../../wailsjs/go/models';
import {
    normalizeReferentialAction,
    severityForAction,
    summarizeIncomingRelationships,
    worstSeverity,
} from './deleteImpact';

function rel(overrides: Partial<models.TableRelationship>) {
    return models.TableRelationship.createFrom({
        ConstraintName: 'fk_orders_user',
        SourceSchema: 'public',
        SourceTable: 'orders',
        SourceColumn: 'user_id',
        TargetSchema: 'public',
        TargetTable: 'users',
        TargetColumn: 'id',
        OnDelete: 'NO ACTION',
        OnUpdate: 'NO ACTION',
        ...overrides,
    });
}

const users = { schema: 'public', table: 'users' };

describe('normalizeReferentialAction', () => {
    it('uppercases and collapses whitespace', () => {
        expect(normalizeReferentialAction(' set   null ')).toBe('SET NULL');
    });

    it('falls back to NO ACTION for empty or unknown values', () => {
        expect(normalizeReferentialAction('')).toBe('NO ACTION');
        expect(normalizeReferentialAction(undefined)).toBe('NO ACTION');
        expect(normalizeReferentialAction('DEFER')).toBe('NO ACTION');
    });
});

describe('severityForAction', () => {
    it('maps each rule to a severity', () => {
        expect(severityForAction('NO ACTION')).toBe('blocking');
        expect(severityForAction('RESTRICT')).toBe('blocking');
        expect(severityForAction('CASCADE')).toBe('cascade');
        expect(severityForAction('SET NULL')).toBe('nullify');
        expect(severityForAction('SET DEFAULT')).toBe('nullify');
    });
});

describe('summarizeIncomingRelationships', () => {
    it('keeps only keys that point into the target table', () => {
        const result = summarizeIncomingRelationships(
            [
                rel({}),
                // Outgoing from users: users.role_id -> roles.id
                rel({
                    ConstraintName: 'fk_users_role',
                    SourceTable: 'users',
                    SourceColumn: 'role_id',
                    TargetTable: 'roles',
                    TargetColumn: 'id',
                }),
            ],
            users,
        );

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            sourceTable: 'orders',
            constraintName: 'fk_orders_user',
            columns: ['user_id'],
            severity: 'blocking',
        });
    });

    it('merges the columns of a composite key into one entry', () => {
        const result = summarizeIncomingRelationships(
            [
                rel({ SourceColumn: 'tenant_id', TargetColumn: 'tenant_id' }),
                rel({ SourceColumn: 'user_id', TargetColumn: 'id' }),
            ],
            users,
        );

        expect(result).toHaveLength(1);
        expect(result[0].columns).toEqual(['tenant_id', 'user_id']);
    });

    it('keeps which child column points at which parent column', () => {
        const result = summarizeIncomingRelationships(
            [
                rel({ SourceColumn: 'tenant_id', TargetColumn: 'tenant_id' }),
                rel({ SourceColumn: 'user_id', TargetColumn: 'id' }),
            ],
            users,
        );

        expect(result[0].columnPairs).toEqual([
            { source: 'tenant_id', target: 'tenant_id' },
            { source: 'user_id', target: 'id' },
        ]);
        expect(result[0].hasUnambiguousColumnMapping).toBe(true);
    });

    it('flags a composite key whose rows are a cross product as ambiguous', () => {
        // What the Postgres relationship query can return for (a, b) -> (x, y).
        const result = summarizeIncomingRelationships(
            [
                rel({ SourceColumn: 'a', TargetColumn: 'x' }),
                rel({ SourceColumn: 'a', TargetColumn: 'y' }),
                rel({ SourceColumn: 'b', TargetColumn: 'x' }),
                rel({ SourceColumn: 'b', TargetColumn: 'y' }),
            ],
            users,
        );

        expect(result).toHaveLength(1);
        expect(result[0].hasUnambiguousColumnMapping).toBe(false);
    });

    it('treats an ordinary single-column key as unambiguous', () => {
        const result = summarizeIncomingRelationships([rel({}), rel({})], users);

        expect(result[0].columnPairs).toEqual([{ source: 'user_id', target: 'id' }]);
        expect(result[0].hasUnambiguousColumnMapping).toBe(true);
    });

    it('does not repeat a column when the backend returns duplicate rows', () => {
        const result = summarizeIncomingRelationships([rel({}), rel({})], users);

        expect(result).toHaveLength(1);
        expect(result[0].columns).toEqual(['user_id']);
    });

    it('keeps constraints with the same name on different child tables apart', () => {
        const result = summarizeIncomingRelationships(
            [rel({ SourceTable: 'orders' }), rel({ SourceTable: 'invoices' })],
            users,
        );

        expect(result.map(r => r.sourceTable)).toEqual(['invoices', 'orders']);
    });

    it('matches table and schema names case-insensitively', () => {
        const result = summarizeIncomingRelationships([rel({})], {
            schema: 'PUBLIC',
            table: 'Users',
        });

        expect(result).toHaveLength(1);
    });

    it('ignores keys into a same-named table in another schema', () => {
        const result = summarizeIncomingRelationships([rel({ TargetSchema: 'audit' })], users);

        expect(result).toEqual([]);
    });

    it('lets the table name decide when either schema is blank', () => {
        const result = summarizeIncomingRelationships([rel({ TargetSchema: '' })], users);
        expect(result).toHaveLength(1);

        const noTargetSchema = summarizeIncomingRelationships([rel({})], {
            schema: '',
            table: 'users',
        });
        expect(noTargetSchema).toHaveLength(1);
    });

    describe('self references', () => {
        const selfRef = rel({
            ConstraintName: 'fk_users_parent',
            SourceTable: 'users',
            SourceColumn: 'parent_id',
        });

        it('are skipped by default (dropping the table removes them)', () => {
            expect(summarizeIncomingRelationships([selfRef], users)).toEqual([]);
        });

        it('are kept and flagged when deleting rows', () => {
            const result = summarizeIncomingRelationships([selfRef], users, {
                includeSelfReferences: true,
            });

            expect(result).toHaveLength(1);
            expect(result[0].isSelfReference).toBe(true);
        });
    });

    it('orders blocking before cascade before nullify, then by table name', () => {
        const result = summarizeIncomingRelationships(
            [
                rel({ SourceTable: 'a_nullify', OnDelete: 'SET NULL' }),
                rel({ SourceTable: 'z_blocking', OnDelete: 'RESTRICT' }),
                rel({ SourceTable: 'b_cascade', OnDelete: 'CASCADE' }),
                rel({ SourceTable: 'a_blocking', OnDelete: 'NO ACTION' }),
            ],
            users,
        );

        expect(result.map(r => r.sourceTable)).toEqual([
            'a_blocking',
            'z_blocking',
            'b_cascade',
            'a_nullify',
        ]);
    });

    it('returns an empty list for missing input', () => {
        expect(summarizeIncomingRelationships(null, users)).toEqual([]);
        expect(summarizeIncomingRelationships(undefined, users)).toEqual([]);
        expect(summarizeIncomingRelationships([], users)).toEqual([]);
    });
});

describe('worstSeverity', () => {
    it('is null when there is nothing to warn about', () => {
        expect(worstSeverity([])).toBeNull();
    });

    it('picks the most serious severity present', () => {
        const items = summarizeIncomingRelationships(
            [
                rel({ SourceTable: 'a', OnDelete: 'SET NULL' }),
                rel({ SourceTable: 'b', OnDelete: 'CASCADE' }),
            ],
            users,
        );

        expect(worstSeverity(items)).toBe('cascade');
    });
});
