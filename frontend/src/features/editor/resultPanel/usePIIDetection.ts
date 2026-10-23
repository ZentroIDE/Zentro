// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import type { TabResult } from '../../../stores/resultStore';
import type { PIIDetectionResult } from '../../../lib/piiDetectionTypes';
import { detectPII } from '../../../lib/piiDetectionRegistry';

interface UsePIIDetectionOptions {
    result?: TabResult;
    canUsePIIDetection: boolean;
    canUseScreenshotBlur: boolean;
    screenshotBlurEnabled: boolean;
}

interface UsePIIDetectionReturn {
    piiDetection: PIIDetectionResult | null;
    blurredColumnIndexes: Set<number> | undefined;
    setColumnBlurOverride: (columnIndex: number, blurred: boolean) => void;
    hasPII: boolean;
}

export function usePIIDetection({
    result,
    canUsePIIDetection,
    canUseScreenshotBlur,
    screenshotBlurEnabled,
}: UsePIIDetectionOptions): UsePIIDetectionReturn {
    const [columnBlurOverrides, setColumnBlurOverrides] = React.useState<Map<number, boolean>>(
        () => new Map(),
    );

    const piiDetection = React.useMemo(() => {
        if (!result?.isSelect || !canUsePIIDetection) {
            return null;
        }
        return detectPII(result.columns, result.rows.slice(0, 500));
    }, [canUsePIIDetection, result]);

    const autoBlurredColumnIndexes = React.useMemo(() => {
        if (!canUseScreenshotBlur || !screenshotBlurEnabled || !piiDetection?.hasPII) {
            return new Set<number>();
        }
        return new Set(piiDetection.columns.map(column => column.columnIndex));
    }, [canUseScreenshotBlur, piiDetection, screenshotBlurEnabled]);

    const blurredColumnIndexes = React.useMemo(() => {
        if (!canUseScreenshotBlur) {
            return undefined;
        }
        const next = new Set(autoBlurredColumnIndexes);
        columnBlurOverrides.forEach((blurred, columnIndex) => {
            if (blurred) next.add(columnIndex);
            else next.delete(columnIndex);
        });
        return next;
    }, [autoBlurredColumnIndexes, canUseScreenshotBlur, columnBlurOverrides]);

    const setColumnBlurOverride = React.useCallback((columnIndex: number, blurred: boolean) => {
        setColumnBlurOverrides(prev => {
            const next = new Map(prev);
            next.set(columnIndex, blurred);
            return next;
        });
    }, []);

    React.useEffect(() => {
        setColumnBlurOverrides(new Map());
    }, [result?.lastExecutedQuery]);

    return {
        piiDetection,
        blurredColumnIndexes,
        setColumnBlurOverride,
        hasPII: Boolean(piiDetection?.hasPII),
    };
}
