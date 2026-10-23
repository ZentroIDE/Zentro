// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WriteOperationKind } from './writeSafety';

const mocks = vi.hoisted(() => ({
    useFeatureGate: vi.fn(),
    openUpgradeUrl: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    preflightQuery: vi.fn(),
    unlockProductionWrites: vi.fn(),
}));

vi.mock('../../lib/license/useFeatureGate', () => ({
    useFeatureGate: mocks.useFeatureGate,
}));

vi.mock('../../lib/license/service', () => ({
    openUpgradeUrl: mocks.openUpgradeUrl,
}));

vi.mock('../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({
        query: {
            preflight: mocks.preflightQuery,
            unlockProductionWrites: mocks.unlockProductionWrites,
        },
    }),
}));

vi.mock('../../components/layout/Toast', () => ({
    useToast: () => ({
        toast: {
            error: mocks.toastError,
            success: mocks.toastSuccess,
        },
    }),
}));

vi.mock('../../components/layout/UpgradeDialog', () => ({
    UpgradeDialog: ({ open, source }: { open: boolean; source?: string }) =>
        open ? <div data-testid='upgrade-dialog'>{source}</div> : null,
}));

import { useWriteSafetyGuard, type WriteGuardNotice } from './useWriteSafetyGuard';
import { useSettingsStore } from '../../stores/settingsStore';

function Harness({
    environmentKey = 'pro',
    operations = [WriteOperationKind.DELETE],
    onResult,
}: {
    environmentKey?: string;
    operations?: WriteOperationKind[];
    onResult?: (result: unknown) => void;
}) {
    const { guardOperations, modals } = useWriteSafetyGuard(environmentKey);

    return (
        <>
            <button
                onClick={() => {
                    void guardOperations(operations, 'Execute').then(result => onResult?.(result));
                }}
            >
                Open write confirm
            </button>
            {modals}
        </>
    );
}

function SqlHarness({
    environmentKey = 'pro',
    sql = 'DELETE FROM accounts;',
}: {
    environmentKey?: string;
    sql?: string;
}) {
    const { guardSql, modals } = useWriteSafetyGuard(environmentKey);

    return (
        <>
            <button
                onClick={() => {
                    void guardSql(sql, 'Execute');
                }}
            >
                Open write confirm
            </button>
            {modals}
        </>
    );
}

describe('useWriteSafetyGuard upgrade CTA', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.useFeatureGate.mockReturnValue({
            hasFullAccess: false,
            isPro: false,
            canUse: vi.fn().mockReturnValue(false),
        });
    });

    it('shows the Upgrade CTA for free users on pro-relevant write flows', async () => {
        render(<Harness environmentKey='pro' operations={[WriteOperationKind.DELETE]} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Open write confirm'));
            await Promise.resolve();
        });

        expect(screen.getByText('Confirm Destructive Write')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Upgrade to Pro/i })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Upgrade to Pro/i }));

        await waitFor(() => {
            expect(screen.getByTestId('upgrade-dialog')).toBeInTheDocument();
        });
        expect(screen.getByText('write-confirm')).toBeInTheDocument();
        expect(screen.getByText('Confirm Destructive Write')).toBeInTheDocument();
    });

    it('does not show the Upgrade CTA for non-pro write confirms', async () => {
        render(<Harness environmentKey='dev' operations={[WriteOperationKind.DELETE]} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Open write confirm'));
            await Promise.resolve();
        });

        expect(screen.getByText('Confirm Destructive Write')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Upgrade to Pro/i })).not.toBeInTheDocument();
    });

    // Regression: for a plain non-Pro destructive confirm with no extra guard
    // fields, confirmDisabled/requiresTextInput are identical before and after
    // the dialog opens (both false) — WriteConfirmDialog's footerContent memo
    // must still refresh on that transition, or the Execute button's onClick
    // stays bound to the pre-open render's handleConfirm (closed over a null
    // pendingRequest) and silently no-ops forever: no toast, no dialog close,
    // no error.
    it('resolves the guard promise when Execute is clicked on a plain non-pro destructive confirm', async () => {
        const onResult = vi.fn();
        render(
            <Harness
                environmentKey='dev'
                operations={[WriteOperationKind.DELETE]}
                onResult={onResult}
            />,
        );

        await act(async () => {
            fireEvent.click(screen.getByText('Open write confirm'));
            await Promise.resolve();
        });

        const execBtn = screen.getByRole('button', { name: /Execute on Development/i });
        expect(execBtn).not.toBeDisabled();

        await act(async () => {
            fireEvent.click(execBtn);
            await Promise.resolve();
        });

        expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ allowed: true }));
        expect(screen.queryByText('Confirm Destructive Write')).not.toBeInTheDocument();
    });

    it('does not show the Upgrade CTA for non-destructive production writes on free', async () => {
        render(<Harness environmentKey='pro' operations={[WriteOperationKind.INSERT]} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Open write confirm'));
            await Promise.resolve();
        });

        expect(screen.getByText('Confirm Write Operation')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Upgrade to Pro/i })).not.toBeInTheDocument();
    });

    it('shows advanced production guard fields for Pro users without upgrade CTA', async () => {
        mocks.useFeatureGate.mockReturnValue({
            hasFullAccess: true,
            isPro: true,
            canUse: vi.fn(featureId => {
                return [
                    'safety.production_unlock',
                    'safety.type_to_confirm',
                    'safety.cooldown',
                    'safety.reason_audit',
                ].includes(featureId);
            }),
        });

        render(<Harness environmentKey='pro' operations={[WriteOperationKind.DELETE]} />);

        await act(async () => {
            fireEvent.click(screen.getByText('Open write confirm'));
            await Promise.resolve();
        });

        expect(
            screen.getByText(/Writes are locked by default in Production\./i),
        ).toBeInTheDocument();
        expect(screen.getByPlaceholderText('DELETE')).toBeInTheDocument();
        expect(screen.getByText(/^Reason$/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Upgrade to Pro/i })).not.toBeInTheDocument();
    });

    it('always places the Execute button to the right of the Wrap in Transaction button', async () => {
        mocks.useFeatureGate.mockReturnValue({
            hasFullAccess: true,
            isPro: true,
            canUse: vi.fn(featureId => {
                return ['recovery.transaction_assistant'].includes(featureId);
            }),
        });

        const mockPreflight = {
            statements: [
                {
                    statementText: 'DELETE FROM accounts WHERE id = 1;',
                    operation: 'delete',
                    riskLevel: 'high',
                    hasWhere: true,
                    destructive: true,
                    previewSupported: true,
                },
            ],
            riskLevel: 'high',
            requiresPro: false,
            requiresProductionUnlock: false,
            productionUnlock: { environmentKey: 'pro', unlocked: false },
            requiresTypeToConfirm: false,
            requiresCooldown: false,
            requiresReason: false,
            affectedRowsPreview: { supported: true, countKnown: true, affectedRowCount: 10 },
            transactionSuggested: true,
            snapshotRequired: false,
        };

        mocks.preflightQuery.mockResolvedValue({ ok: true, data: mockPreflight });

        render(<SqlHarness environmentKey='pro' sql='DELETE FROM accounts WHERE id = 1;' />);

        await act(async () => {
            fireEvent.click(screen.getByText('Open write confirm'));
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(screen.getByText('Wrap in Transaction')).toBeInTheDocument();
        });

        const wrapBtn = screen.getByRole('button', { name: 'Wrap in Transaction' });
        const execBtn = screen.getByRole('button', { name: 'Execute on Production' });

        expect(wrapBtn).toBeInTheDocument();
        expect(execBtn).toBeInTheDocument();

        expect(
            wrapBtn.compareDocumentPosition(execBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });
});

describe('useWriteSafetyGuard notice', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.useFeatureGate.mockReturnValue({
            hasFullAccess: false,
            isPro: false,
            canUse: vi.fn().mockReturnValue(false),
        });
    });

    const makeNotice = (overrides: Partial<WriteGuardNotice> = {}): WriteGuardNotice => ({
        content: ({ dismiss }) => (
            <div>
                <p>Rows in other tables reference these rows.</p>
                <button onClick={dismiss}>Look at them first</button>
            </div>
        ),
        ...overrides,
    });

    function NoticeHarness({
        environmentKey,
        notice,
        onResult,
    }: {
        environmentKey: string;
        notice?: WriteGuardNotice;
        onResult?: (result: unknown) => void;
    }) {
        const { guardSql, modals } = useWriteSafetyGuard(environmentKey);
        return (
            <>
                <button
                    onClick={() => {
                        void guardSql('DELETE FROM orders WHERE order_id = 10250;', 'Execute', {
                            notice,
                        }).then(result => onResult?.(result));
                    }}
                >
                    Guard
                </button>
                {modals}
            </>
        );
    }

    const open = async () => {
        await act(async () => {
            fireEvent.click(screen.getByText('Guard'));
            await Promise.resolve();
        });
    };

    describe('where the environment asks anyway', () => {
        it('shows the notice inside the same confirmation, with the risk banner and script', async () => {
            render(<NoticeHarness environmentKey='dev' notice={makeNotice()} />);

            await open();

            expect(screen.getByText('Confirm Destructive Write')).toBeInTheDocument();
            expect(screen.getByText(/Destructive operation detected/)).toBeInTheDocument();
            expect(
                screen.getByText('Rows in other tables reference these rows.'),
            ).toBeInTheDocument();
            expect(
                screen.getByText(/DELETE FROM orders WHERE order_id = 10250;/),
            ).toBeInTheDocument();
        });

        it('is one dialog, not two', async () => {
            render(<NoticeHarness environmentKey='dev' notice={makeNotice()} />);

            await open();

            expect(screen.getAllByRole('dialog')).toHaveLength(1);
        });

        it('confirms with the normal audit trail when Execute is clicked', async () => {
            const onResult = vi.fn();
            render(
                <NoticeHarness environmentKey='dev' notice={makeNotice()} onResult={onResult} />,
            );
            await open();

            await act(async () => {
                fireEvent.click(screen.getByRole('button', { name: /Execute on Development/i }));
                await Promise.resolve();
            });

            expect(onResult).toHaveBeenCalledWith(
                expect.objectContaining({
                    allowed: true,
                    auditMeta: expect.objectContaining({ riskLevel: expect.any(String) }),
                }),
            );
        });
    });

    it('still shows the notice, inside the destructive confirmation, at the most relaxed safety level', async () => {
        // A DELETE is confirmed whatever the level, so the notice always has a dialog to ride in.
        useSettingsStore.setState({
            environmentSafetyLevels: { 'relaxed-env': 'relaxed' },
        } as never);
        render(<NoticeHarness environmentKey='relaxed-env' notice={makeNotice()} />);

        await open();

        expect(screen.getByText('Confirm Destructive Write')).toBeInTheDocument();
        expect(screen.getByText('Rows in other tables reference these rows.')).toBeInTheDocument();
    });

    it('is not shown, and changes nothing, when there is no notice', async () => {
        render(<NoticeHarness environmentKey='dev' />);

        await open();

        expect(screen.getByText('Confirm Destructive Write')).toBeInTheDocument();
        expect(
            screen.queryByText('Rows in other tables reference these rows.'),
        ).not.toBeInTheDocument();
    });

    it('does not make the guard ask when the write is not one that needs confirming', async () => {
        const onResult = vi.fn();
        function SelectHarness() {
            const { guardSql, modals } = useWriteSafetyGuard('dev');
            return (
                <>
                    <button
                        onClick={() =>
                            void guardSql('SELECT 1', 'Execute', { notice: makeNotice() }).then(
                                onResult,
                            )
                        }
                    >
                        Guard
                    </button>
                    {modals}
                </>
            );
        }
        render(<SelectHarness />);

        await act(async () => {
            fireEvent.click(screen.getByText('Guard'));
            await Promise.resolve();
        });

        await waitFor(() => expect(onResult).toHaveBeenCalledWith({ allowed: true }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('lets the notice close the dialog as a cancel, for an action that leads elsewhere', async () => {
        const onResult = vi.fn();
        render(<NoticeHarness environmentKey='dev' notice={makeNotice()} onResult={onResult} />);
        await open();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Look at them first' }));
            await Promise.resolve();
        });

        expect(onResult).toHaveBeenCalledWith({ allowed: false });
        expect(screen.queryByText('Confirm Destructive Write')).not.toBeInTheDocument();
    });
});
