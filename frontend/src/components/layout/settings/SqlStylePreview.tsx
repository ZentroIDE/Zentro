// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    resolvePreviewBase,
    resolvePreviewStyle,
    SQL_PREVIEW_LINES,
} from '../../../lib/sqlStylePreview';
import type { SqlStyleAppearance, SqlStyleMap } from '../../../lib/sqlEditorStyle';

interface Props {
    appearance: SqlStyleAppearance;
    /** Theme preset the user has chosen for this appearance; sets the editor colours. */
    presetId?: string;
    overrides: SqlStyleMap;
    schemaHighlight: boolean;
}

/**
 * The sample query drawn with the theme's own editor colours plus the user's
 * overrides, on that theme's background, so it matches the editor whichever app
 * theme is active right now.
 */
export const SqlStylePreview: React.FC<Props> = ({
    appearance,
    presetId,
    overrides,
    schemaHighlight,
}) => {
    const base = React.useMemo(
        () => resolvePreviewBase(presetId, appearance),
        [appearance, presetId],
    );

    return (
        <div
            role='img'
            aria-label={`Preview of the SQL editor in the ${appearance} theme`}
            className='overflow-x-auto rounded-md border border-border p-3 font-mono text-label leading-relaxed'
            style={{ background: base.background, color: base.foreground }}
        >
            {SQL_PREVIEW_LINES.map((tokens, lineIndex) => (
                <div key={lineIndex} className='whitespace-pre'>
                    {tokens.map((token, tokenIndex) => {
                        if (!token.category) return <span key={tokenIndex}>{token.text}</span>;
                        const style = resolvePreviewStyle(
                            token.category,
                            base,
                            overrides,
                            appearance,
                            schemaHighlight,
                        );
                        return (
                            <span key={tokenIndex} style={style}>
                                {token.text}
                            </span>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};
