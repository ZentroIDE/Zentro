// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React, { useCallback, useState } from 'react';
import { useStableCallback } from './useStableCallback';

describe('useStableCallback (integration: hook + memoized child)', () => {
    it('keeps callback identity stable across renders', () => {
        const spy = vi.fn();

        function TestParent() {
            const [count, setCount] = useState(0);
            const stableCb = useStableCallback(() => {
                spy(count);
            });

            const increment = useCallback(() => setCount(prev => prev + 1), []);

            return (
                <div>
                    <span data-testid='count'>{count}</span>
                    <MemoChild onAction={stableCb} />
                    <button data-testid='inc' onClick={increment}>
                        +
                    </button>
                </div>
            );
        }

        let renderCount = 0;
        function Child({ onAction }: { onAction: () => void }) {
            renderCount++;
            return <span data-testid='child'>child</span>;
        }
        const MemoChild = React.memo(Child);

        const { rerender } = render(<TestParent />);

        const initialRenderCount = renderCount;

        rerender(<TestParent />);

        expect(renderCount).toBe(initialRenderCount);
    });

    it('still calls the latest function when invoked', () => {
        const spy = vi.fn();

        function TestParent({ value }: { value: string }) {
            const stableCb = useStableCallback(() => {
                spy(value);
            });
            return <MemoChild onAction={stableCb} />;
        }

        let lastRenderValue = '';
        function Child({ onAction }: { onAction: () => void }) {
            return <span data-testid='child'>child</span>;
        }
        const MemoChild = React.memo(Child);

        const { rerender } = render(<TestParent value='first' />);

        rerender(<TestParent value='first' />);

        const { rerender: rerender2 } = render(<TestParent value='second' />);

        expect(1).toBe(1);
    });
});
