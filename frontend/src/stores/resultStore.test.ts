// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it } from 'vitest';
import { useResultStore } from './resultStore';
import { DEFAULT_WORKSPACE_ID } from './result/types';

describe('resultStore', () => {
    beforeEach(() => {
        useResultStore.setState({
            results: {},
            projectResults: { [DEFAULT_WORKSPACE_ID]: {} },
            activeProjectId: DEFAULT_WORKSPACE_ID,
            messagesByTab: {},
            resultEpochs: {},
            resultRevealRequest: null,
        } as any);
    });

    it('collects server messages per source tab in arrival order and clears them', () => {
        const store = useResultStore.getState();
        store.appendMessage('tab-1', 'first');
        store.appendMessage('tab-1', 'second');
        store.appendMessage('tab-2', 'other');

        expect(useResultStore.getState().messagesByTab['tab-1']).toEqual(['first', 'second']);
        expect(useResultStore.getState().messagesByTab['tab-2']).toEqual(['other']);

        useResultStore.getState().clearMessages('tab-1');
        expect(useResultStore.getState().messagesByTab['tab-1']).toBeUndefined();
        expect(useResultStore.getState().messagesByTab['tab-2']).toEqual(['other']);
    });

    it('initializes and appends rows', () => {
        useResultStore.getState().initTab('tab-1');
        useResultStore.getState().appendRows('tab-1', ['id', 'name'], [['1', 'alice']]);

        const result = useResultStore.getState().results['tab-1'];
        expect(result.columns).toEqual(['id', 'name']);
        expect(result.rows).toHaveLength(1);
    });

    it('marks query done and keeps select rows', () => {
        useResultStore.getState().initTab('tab-1');
        useResultStore.getState().appendRows('tab-1', ['id'], [['1'], ['2']]);
        useResultStore.getState().setDone('tab-1', 0, 12, true, false);

        const result = useResultStore.getState().results['tab-1'];
        expect(result.isDone).toBe(true);
        expect(result.affected).toBe(2);
        expect(result.rows).toHaveLength(2);
    });

    it('appends fetch-more chunks even if query-done lands first', () => {
        useResultStore.getState().initTab('tab-1');
        useResultStore.getState().appendRows('tab-1', ['id'], [['1'], ['2']]);
        useResultStore.getState().touchProgress('tab-1', 2);

        useResultStore.getState().setOffset('tab-1', 2);
        useResultStore.getState().setDone('tab-1', 2, 5, true, true);
        useResultStore.getState().appendRows('tab-1', ['id'], [['3'], ['4']]);

        const result = useResultStore.getState().results['tab-1'];
        expect(result.rows).toEqual([['1'], ['2'], ['3'], ['4']]);
    });

    describe('keepResult', () => {
        const editedResult = () => {
            const store = useResultStore.getState();
            store.initTab('tab-1');
            store.appendRows(
                'tab-1',
                ['id', 'name'],
                [
                    ['1', 'a'],
                    ['2', 'b'],
                ],
                'users',
                ['id'],
            );
            store.setDone('tab-1', 0, 5, true, true);
            store.updatePendingState('tab-1', new Map([['0:1', 'x']]), new Set([1]), []);
        };

        it('moves the result, edits included, to the new key', () => {
            editedResult();

            useResultStore.getState().keepResult('tab-1', 'tab-1::result:kept-1');

            const kept = useResultStore.getState().results['tab-1::result:kept-1'];
            expect(kept.rows).toEqual([
                ['1', 'a'],
                ['2', 'b'],
            ]);
            expect(Array.from(kept.pendingEdits ?? [])).toEqual([['0:1', 'x']]);
            expect(Array.from(kept.pendingDeletions ?? [])).toEqual([1]);
            expect(kept.tableName).toBe('users');
            expect(kept.primaryKeys).toEqual(['id']);
            expect(kept.hasMore).toBe(true);
        });

        it('leaves the old key showing the same rows, with no edits, for the next run to replace', () => {
            editedResult();

            useResultStore.getState().keepResult('tab-1', 'tab-1::result:kept-1');

            const main = useResultStore.getState().results['tab-1'];
            expect(main.rows).toEqual([
                ['1', 'a'],
                ['2', 'b'],
            ]);
            expect(main.pendingEdits?.size).toBe(0);
            expect(main.pendingDeletions?.size).toBe(0);
            expect(main.pendingDraftRows).toEqual([]);
        });

        it('keeps the moved result untouched when the old key is then re-run', () => {
            editedResult();
            useResultStore.getState().keepResult('tab-1', 'tab-1::result:kept-1');

            useResultStore.getState().initTab('tab-1');
            useResultStore.getState().appendRows('tab-1', ['n'], [['9']]);

            const kept = useResultStore.getState().results['tab-1::result:kept-1'];
            expect(kept.columns).toEqual(['id', 'name']);
            expect(kept.pendingEdits?.size).toBe(1);
        });

        it('bumps the epoch of the old key so its panel starts clean', () => {
            editedResult();
            expect(useResultStore.getState().resultEpochs['tab-1'] ?? 0).toBe(0);

            useResultStore.getState().keepResult('tab-1', 'tab-1::result:kept-1');
            useResultStore.getState().keepResult('tab-1', 'tab-1::result:kept-2');

            expect(useResultStore.getState().resultEpochs['tab-1']).toBe(2);
        });

        it('does nothing when there is no result to keep', () => {
            useResultStore.getState().keepResult('missing', 'missing::result:kept-1');

            expect(useResultStore.getState().results['missing::result:kept-1']).toBeUndefined();
            expect(useResultStore.getState().resultEpochs['missing']).toBeUndefined();
        });
    });

    it('asks for a result to be revealed, with a fresh nonce each time', () => {
        useResultStore.getState().requestResultReveal('tab-1::result:kept-1');
        const first = useResultStore.getState().resultRevealRequest;
        useResultStore.getState().requestResultReveal('tab-1::result:kept-1');
        const second = useResultStore.getState().resultRevealRequest;

        expect(first?.key).toBe('tab-1::result:kept-1');
        expect(second?.nonce).toBeGreaterThan(first?.nonce ?? 0);
    });
});
