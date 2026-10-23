// SPDX-License-Identifier: GPL-3.0-only

import type { editor } from 'monaco-editor';
import type { OnMount } from '@monaco-editor/react';

type MonacoInstance = Parameters<OnMount>[1];
type Severity = 'error' | 'warning';

/** Anything that can be shown as an inline warning at a text range. */
export interface RangeWarning {
    startOffset: number;
    endOffset: number;
    /** Full text, shown on hover and in the Problems list. */
    message: string;
    /** Shorter text for the end of the line; falls back to `message`. */
    shortMessage?: string;
    /** Defaults to a warning. */
    severity?: Severity;
}

const DEFAULT_MARKER_SOURCE = 'schema-context';
const INLINE_MESSAGE_MAX_LENGTH = 160;
// Separates the message from the code. Spaces in the text rather than CSS
// margin: Monaco splits a long injected text into chunks that all share the
// class, so a margin would repeat inside the message.
const INLINE_MESSAGE_GAP = '\u00a0\u00a0';

const severityOf = (warning: RangeWarning): Severity => warning.severity ?? 'warning';

function truncate(text: string): string {
    return text.length > INLINE_MESSAGE_MAX_LENGTH
        ? `${text.slice(0, INLINE_MESSAGE_MAX_LENGTH - 1)}…`
        : text;
}

function buildSquiggle(monaco: MonacoInstance, model: editor.ITextModel, warning: RangeWarning) {
    const start = model.getPositionAt(warning.startOffset);
    const end = model.getPositionAt(warning.endOffset);
    return {
        range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
        options: {
            inlineClassName:
                severityOf(warning) === 'error'
                    ? 'zentro-schema-error-token'
                    : 'zentro-schema-warning-token',
            hoverMessage: { value: warning.message },
        },
    };
}

/**
 * Error Lens style: the message written after the code, with the line
 * tinted. A line shows only its most severe message (the first on a tie); the
 * squiggles and hover still cover every warning.
 */
function buildInlineMessages(
    monaco: MonacoInstance,
    model: editor.ITextModel,
    warnings: RangeWarning[],
) {
    const byLine = new Map<number, RangeWarning>();
    warnings.forEach(warning => {
        const line = model.getPositionAt(warning.startOffset).lineNumber;
        const shown = byLine.get(line);
        if (!shown || (severityOf(shown) === 'warning' && severityOf(warning) === 'error')) {
            byLine.set(line, warning);
        }
    });

    return [...byLine.entries()].map(([line, warning]) => {
        const column = model.getLineMaxColumn(line);
        const severity = severityOf(warning);
        return {
            range: new monaco.Range(line, column, line, column),
            options: {
                isWholeLine: true,
                // Monaco drops injected text on an empty range unless told otherwise
                // (textModel.getInjectedTextInInterval), so without this only the
                // line tint would show.
                showIfCollapsed: true,
                className: `zentro-error-lens-line-${severity}`,
                after: {
                    content: `${INLINE_MESSAGE_GAP}${truncate(warning.shortMessage ?? warning.message)}`,
                    inlineClassName: `zentro-error-lens-message-${severity}`,
                },
            },
        };
    });
}

/** Renders inline warning decorations and their matching model
 *  markers. `ownerId` scopes the markers so they can be cleared without
 *  touching markers from other sources (matches Monaco's per-owner marker
 *  model). `update([], ...)` (an empty warnings list) clears both.
 *  `options.source` labels the markers in the Problems UI. `update`'s second
 *  argument turns the end-of-line messages on. */
export function setupSchemaWarningDecorations(
    editor: editor.IStandaloneCodeEditor,
    monaco: MonacoInstance,
    ownerId: string,
    options: { source?: string } = {},
): { update: (warnings: RangeWarning[], inlineMessages?: boolean) => void; clear: () => void } {
    const decorations = editor.createDecorationsCollection();

    const clearFor = (model: editor.ITextModel | null) => {
        if (model) monaco.editor.setModelMarkers(model, ownerId, []);
        decorations.clear();
    };

    const clear = () => clearFor(editor.getModel());

    const update = (warnings: RangeWarning[], inlineMessages = false) => {
        const model = editor.getModel();
        if (!model) return;

        if (warnings.length === 0) {
            clearFor(model);
            return;
        }

        const markers = warnings.map(warning => {
            const start = model.getPositionAt(warning.startOffset);
            const end = model.getPositionAt(warning.endOffset);
            return {
                startLineNumber: start.lineNumber,
                startColumn: start.column,
                endLineNumber: end.lineNumber,
                endColumn: end.column,
                message: warning.message,
                severity:
                    severityOf(warning) === 'error'
                        ? monaco.MarkerSeverity.Error
                        : monaco.MarkerSeverity.Warning,
                source: options.source ?? DEFAULT_MARKER_SOURCE,
            };
        });

        monaco.editor.setModelMarkers(model, ownerId, markers);
        decorations.set([
            ...warnings.map(warning => buildSquiggle(monaco, model, warning)),
            ...(inlineMessages ? buildInlineMessages(monaco, model, warnings) : []),
        ]);
    };

    return { update, clear };
}
