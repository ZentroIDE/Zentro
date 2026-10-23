// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { captured, getTransactionStatus, emitLicenseStateChanged } = vi.hoisted(() => ({
    captured: {
        onConnectionChanged: null,
        onConnectionUpdated: null,
        onTransactionStatus: null,
        onSchemaDatabases: null,
        onSchemaError: null,
        onSchemaLoaded: null,
        onLicenseStateChanged: null,
        onQueryStarted: null,
        onQueryChunk: null,
        onQueryDone: null,
        onQueryTransactionSummary: null,
        onQueryCount: null,
        onQueryRange: null,
        onQueryMessage: null,
    } as Record<string, ((data: any) => void) | null>,
    getTransactionStatus: vi.fn(async () => ({ ok: true, data: 'active' })),
    emitLicenseStateChanged: vi.fn(),
}));

vi.mock('../../../lib/events', () => {
    const make = (key: string) => (cb: (data: any) => void) => {
        captured[key] = cb;
        return vi.fn();
    };
    return Object.fromEntries(Object.keys(captured).map(key => [key, make(key)]));
});

vi.mock('../../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({ connection: { getTransactionStatus } }),
}));

vi.mock('../../../lib/license/service', () => ({
    emitLicenseStateChanged: () => emitLicenseStateChanged(),
}));

import { subscribeConnectionEvents } from './connectionEvents';
import { subscribeSchemaEvents } from './schemaEvents';
import { subscribeLicenseEvents } from './licenseEvents';
import { subscribeQueryResultEvents } from './queryResultEvents';
import { useSchemaStore } from '../../../stores/schemaStore';
import { useResultStore } from '../../../stores/resultStore';
import { useEditorStore } from '../../../stores/editorStore';
import { useLayoutStore } from '../../../stores/layoutStore';
import { useStatusStore } from '../../../stores/statusStore';
import { CONNECTION_STATUS, TAB_TYPE, TRANSACTION_STATUS } from '../../../lib/constants';

function makeConnectionDeps() {
    return {
        toast: { error: vi.fn() },
        setIsConnected: vi.fn(),
        setActiveProfile: vi.fn(),
        setDatabases: vi.fn(),
        setConnectionStatus: vi.fn(),
        setTransactionStatus: vi.fn(),
    };
}

beforeEach(() => {
    Object.keys(captured).forEach(key => (captured[key] = null));
    vi.clearAllMocks();
});

describe('subscribeConnectionEvents', () => {
    it('applies connected payloads to the connection stores', () => {
        const deps = makeConnectionDeps();
        subscribeConnectionEvents(deps as any);

        captured.onConnectionChanged!({
            status: CONNECTION_STATUS.CONNECTED,
            profile: { name: 'local', db_name: 'app' },
            databases: ['app', 'other'],
        });

        expect(deps.setIsConnected).toHaveBeenCalledWith(true);
        expect(deps.setConnectionStatus).toHaveBeenCalledWith(CONNECTION_STATUS.CONNECTED);
        expect(deps.setActiveProfile).toHaveBeenCalledWith({ name: 'local', db_name: 'app' });
        expect(deps.setDatabases).toHaveBeenCalledWith(['app', 'other']);
        expect(getTransactionStatus).toHaveBeenCalledTimes(1);
    });

    it('resets state and skips the toast when disconnected', () => {
        const deps = makeConnectionDeps();
        subscribeConnectionEvents(deps as any);

        captured.onConnectionChanged!({ status: CONNECTION_STATUS.DISCONNECTED });

        expect(deps.setIsConnected).toHaveBeenCalledWith(false);
        expect(deps.setActiveProfile).toHaveBeenCalledWith(null);
        expect(deps.setDatabases).toHaveBeenCalledWith([]);
        expect(deps.setTransactionStatus).toHaveBeenCalledWith(TRANSACTION_STATUS.NONE);
        expect(deps.toast.error).not.toHaveBeenCalled();
    });

    it('raises a toast on transaction error status', () => {
        const deps = makeConnectionDeps();
        subscribeConnectionEvents(deps as any);

        captured.onTransactionStatus!({ status: TRANSACTION_STATUS.ERROR, error: 'deadlock' });

        expect(deps.setTransactionStatus).toHaveBeenCalledWith(
            TRANSACTION_STATUS.ERROR,
            'deadlock',
        );
        expect(deps.toast.error).toHaveBeenCalledWith(
            'Transaction failed: deadlock',
            expect.objectContaining({ dedupeKey: 'transaction-error' }),
        );
    });
});

describe('subscribeSchemaEvents', () => {
    it('stores loaded schema trees', () => {
        const setTree = vi.fn();
        useSchemaStore.setState({ setTree } as any);
        subscribeSchemaEvents({ toast: { error: vi.fn() }, setDatabases: vi.fn() });

        captured.onSchemaLoaded!({ profileName: 'p', dbName: 'app', schemas: [{ Name: 'inv' }] });

        expect(setTree).toHaveBeenCalledWith('p', 'app', [{ Name: 'inv' }]);
    });

    it('clears loading and toasts on schema errors', () => {
        const setLoading = vi.fn();
        useSchemaStore.setState({ setLoading } as any);
        const toast = { error: vi.fn() };
        subscribeSchemaEvents({ toast, setDatabases: vi.fn() });

        captured.onSchemaError!({ profileName: 'p', dbName: 'app', error: 'boom' });

        expect(setLoading).toHaveBeenCalledWith('p', 'app', false);
        expect(toast.error).toHaveBeenCalledWith(
            'Failed to load schema for app: boom',
            expect.objectContaining({ dedupeKey: 'schema-error:p:app' }),
        );
    });
});

describe('subscribeLicenseEvents', () => {
    it('re-emits license state changes', () => {
        subscribeLicenseEvents();
        captured.onLicenseStateChanged!({});
        expect(emitLicenseStateChanged).toHaveBeenCalledTimes(1);
    });
});

describe('subscribeQueryResultEvents', () => {
    it('routes count and range payloads straight to the result store', () => {
        const setTotalCount = vi.fn();
        const prependRows = vi.fn();
        useResultStore.setState({ setTotalCount, prependRows } as any);
        subscribeQueryResultEvents({ toast: { error: vi.fn() } });

        captured.onQueryCount!({ tabID: 't1', count: 42 });
        captured.onQueryRange!({ tabID: 't1', offset: 10, rows: [['a']] });
        captured.onQueryRange!({ tabID: 't1', offset: 0, rows: [], error: 'bad range' });

        expect(setTotalCount).toHaveBeenCalledWith('t1', 42);
        expect(prependRows).toHaveBeenCalledTimes(1);
        expect(prependRows).toHaveBeenCalledWith('t1', 10, [['a']]);
    });

    it('routes server messages to the source tab, and clears them when a new run starts', () => {
        const appendMessage = vi.fn();
        const clearMessages = vi.fn();
        useResultStore.setState({ appendMessage, clearMessages } as any);
        subscribeQueryResultEvents({ toast: { error: vi.fn() } });

        captured.onQueryMessage!({ sourceTabID: 'tab-1', tabID: 'tab-1::result:3', text: 'hi' });
        expect(appendMessage).toHaveBeenCalledWith('tab-1', 'hi');

        captured.onQueryStarted!({
            tabID: 'tab-1',
            sourceTabID: 'tab-1',
            query: 'PRINT 1',
            statementText: 'PRINT 1',
            statementIndex: 0,
            statementCount: 1,
        });
        expect(clearMessages).toHaveBeenCalledWith('tab-1');
    });

    describe('starting a new run', () => {
        const edited = { pendingEdits: new Map([['0:0', 'x']]) };
        const clean = { pendingEdits: new Map() };

        const seed = (bucket: Record<string, unknown>) =>
            useResultStore.setState({
                results: bucket,
                projectResults: { __default__: bucket },
                activeProjectId: '__default__',
            } as any);

        const startRun = () => {
            subscribeQueryResultEvents({ toast: { error: vi.fn() } });
            captured.onQueryStarted!({
                tabID: 'tab-1',
                sourceTabID: 'tab-1',
                query: 'SELECT 1',
                statementText: 'SELECT 1',
                statementIndex: 0,
                statementCount: 1,
            });
        };

        it('clears the extra results of the previous run', () => {
            seed({ 'tab-1::result:2': clean, 'tab-1::result:3': clean });

            startRun();

            expect(Object.keys(useResultStore.getState().results)).not.toContain('tab-1::result:2');
            expect(Object.keys(useResultStore.getState().results)).not.toContain('tab-1::result:3');
        });

        it('keeps a result that still holds unsaved edits, such as one set aside by an earlier run', () => {
            seed({
                'tab-1::result:kept-1': edited,
                'tab-1::result:2': clean,
            });

            startRun();

            const keys = Object.keys(useResultStore.getState().results);
            expect(keys).toContain('tab-1::result:kept-1');
            expect(keys).not.toContain('tab-1::result:2');
        });

        it('does not touch the results of another tab', () => {
            seed({ 'tab-2::result:kept-1': edited, 'tab-2::result:2': clean });

            startRun();

            expect(Object.keys(useResultStore.getState().results)).toEqual(
                expect.arrayContaining(['tab-2::result:kept-1', 'tab-2::result:2']),
            );
        });
    });

    it('records transaction summaries per source tab', () => {
        const setTransactionTotals = vi.fn();
        useResultStore.setState({ setTransactionTotals } as any);
        subscribeQueryResultEvents({ toast: { error: vi.fn() } });

        captured.onQueryTransactionSummary!({
            sourceTabID: 'tab-1',
            insertedRows: 3,
            updatedRows: 2,
            deletedRows: 1,
        });

        expect(setTransactionTotals).toHaveBeenCalledWith('tab-1', {
            insertedRows: 3,
            updatedRows: 2,
            deletedRows: 1,
        });
    });

    it('returns unsubscribe callbacks for every subscription plus cleanup', () => {
        const subs = subscribeQueryResultEvents({ toast: { error: vi.fn() } });
        expect(subs).toHaveLength(8);
        subs.forEach(unsub => expect(() => unsub()).not.toThrow());
    });

    describe('auto-opening the bottom result panel on QueryStarted', () => {
        let setShowResultPanel: ReturnType<typeof vi.fn>;

        beforeEach(() => {
            // Flush the rAF-buffered statement side effects synchronously.
            const runNow = (cb: FrameRequestCallback) => {
                cb(0);
                return 0;
            };
            vi.stubGlobal('requestAnimationFrame', runNow);
            window.requestAnimationFrame = runNow as typeof window.requestAnimationFrame;

            setShowResultPanel = vi.fn();
            useLayoutStore.setState({
                setShowResultPanel,
                setBottomPanelView: vi.fn(),
                setActiveBottomPanelId: vi.fn(),
            } as any);
            useResultStore.setState({
                results: {},
                clearResult: vi.fn(),
                initTab: vi.fn(),
                setExecutionState: vi.fn(),
                setLastExecutedQuery: vi.fn(),
                setStatementLabel: vi.fn(),
            } as any);
            useEditorStore.setState({ setTabRunning: vi.fn() } as any);
            useStatusStore.setState({ setQueryRuntime: vi.fn() } as any);
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        function fireStarted(sourceTabID: string) {
            subscribeQueryResultEvents({ toast: { error: vi.fn() } });
            captured.onQueryStarted!({
                tabID: `${sourceTabID}::result:0`,
                sourceTabID,
                statementIndex: 0,
                statementCount: 1,
                query: 'SELECT 1',
                statementText: 'SELECT 1',
            });
        }

        it('reveals the panel for a real editor query tab', () => {
            useEditorStore.setState({
                groups: [{ id: 'g1', tabs: [{ id: 'q1', type: TAB_TYPE.QUERY }] }],
            } as any);

            fireStarted('q1');

            expect(setShowResultPanel).toHaveBeenCalledWith(true);
        });

        it('does not touch panel visibility for a table-tab data grid (data-<tabId>)', () => {
            // TableInfo streams its grid through query.execute('data-<tabId>');
            // that id is not a real editor tab and must not pop the panel.
            useEditorStore.setState({
                groups: [{ id: 'g1', tabs: [{ id: 'tbl1', type: TAB_TYPE.TABLE }] }],
            } as any);

            fireStarted('data-tbl1');

            expect(setShowResultPanel).not.toHaveBeenCalled();
        });

        it('does not reveal the panel when the source is a non-query tab', () => {
            useEditorStore.setState({
                groups: [{ id: 'g1', tabs: [{ id: 'cmp1', type: TAB_TYPE.COMPARE }] }],
            } as any);

            fireStarted('cmp1');

            expect(setShowResultPanel).not.toHaveBeenCalled();
        });
    });
});
