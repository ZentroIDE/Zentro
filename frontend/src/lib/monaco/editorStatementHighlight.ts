// SPDX-License-Identifier: GPL-3.0-only

import type { editor } from 'monaco-editor';
import type { OnMount } from '@monaco-editor/react';

type MonacoInstance = Parameters<OnMount>[1];

interface StatementLineRect {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

interface OutlinePoint {
    x: number;
    y: number;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const WIDGET_ID = 'zentro.activeStatementOutline';
const OUTLINE_RADIUS = 5;
const OUTLINE_ONLY_CLASS = 'zentro-statement-outline-only';

function buildOutlinePath(rects: StatementLineRect[]): string {
    if (rects.length === 0) return '';

    const align = (value: number) => Math.round(value) + 0.5;
    const first = rects[0];
    const last = rects[rects.length - 1];
    const points: OutlinePoint[] = [
        { x: align(first.left), y: align(first.top) },
        { x: align(first.right), y: align(first.top) },
    ];

    rects.forEach((rect, index) => {
        points.push({ x: align(rect.right), y: align(rect.bottom) });
        const next = rects[index + 1];
        if (next) points.push({ x: align(next.right), y: align(rect.bottom) });
    });

    points.push({ x: align(last.left), y: align(last.bottom) });
    for (let index = rects.length - 1; index > 0; index--) {
        points.push({ x: align(rects[index].left), y: align(rects[index].top) });
        points.push({ x: align(rects[index - 1].left), y: align(rects[index].top) });
    }

    return buildRoundedPath(removeRedundantPoints(points), OUTLINE_RADIUS);
}

function removeRedundantPoints(points: OutlinePoint[]): OutlinePoint[] {
    const unique = points.filter(
        (point, index) =>
            index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y,
    );

    return unique.filter((point, index) => {
        const previous = unique[(index - 1 + unique.length) % unique.length];
        const next = unique[(index + 1) % unique.length];
        return !(
            (previous.x === point.x && point.x === next.x) ||
            (previous.y === point.y && point.y === next.y)
        );
    });
}

function buildRoundedPath(points: OutlinePoint[], radius: number): string {
    if (points.length < 3) return '';

    const corners = points.map((point, index) => {
        const previous = points[(index - 1 + points.length) % points.length];
        const next = points[(index + 1) % points.length];
        const cornerRadius = Math.min(
            radius,
            Math.hypot(point.x - previous.x, point.y - previous.y) / 2,
            Math.hypot(next.x - point.x, next.y - point.y) / 2,
        );
        return {
            point,
            start: moveTowards(point, previous, cornerRadius),
            end: moveTowards(point, next, cornerRadius),
        };
    });

    const commands = [`M ${formatPoint(corners[0].start)}`];
    corners.forEach((corner, index) => {
        if (index > 0) commands.push(`L ${formatPoint(corner.start)}`);
        commands.push(`Q ${formatPoint(corner.point)} ${formatPoint(corner.end)}`);
    });
    commands.push('Z');
    return commands.join(' ');
}

function moveTowards(from: OutlinePoint, to: OutlinePoint, distance: number): OutlinePoint {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length === 0) return from;
    return {
        x: from.x + ((to.x - from.x) / length) * distance,
        y: from.y + ((to.y - from.y) / length) * distance,
    };
}

function formatPoint(point: OutlinePoint): string {
    return `${point.x} ${point.y}`;
}

export function setupStatementHighlight(
    editor: editor.IStandaloneCodeEditor,
    _monaco: MonacoInstance,
): { dispose: () => void } {
    const domNode = document.createElement('div');
    const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
    const outline = document.createElementNS(SVG_NAMESPACE, 'path');
    domNode.classList.add('zentro-active-statement-outline');
    domNode.setAttribute('aria-hidden', 'true');
    svg.appendChild(outline);
    domNode.appendChild(svg);

    const widget: editor.IOverlayWidget = {
        getId: () => WIDGET_ID,
        getDomNode: () => domNode,
        getPosition: () => ({ preference: { top: 0, left: 0 } }),
    };
    editor.addOverlayWidget(widget);

    let disposed = false;
    let scheduled = false;

    const clear = () => {
        outline.removeAttribute('d');
        editor.getDomNode()?.classList.remove(OUTLINE_ONLY_CLASS);
    };

    const render = () => {
        if (disposed) return;
        const model = editor.getModel();
        const position = editor.getPosition();
        if (!model || !position) {
            clear();
            return;
        }

        const lineCount = model.getLineCount();
        const currentLine = position.lineNumber;

        if (model.getLineContent(currentLine).trim() === '') {
            clear();
            return;
        }

        let startLine = currentLine;
        while (startLine > 1 && model.getLineContent(startLine - 1).trim() !== '') {
            startLine--;
        }

        let endLine = currentLine;
        while (endLine < lineCount && model.getLineContent(endLine + 1).trim() !== '') {
            endLine++;
        }

        const statementStartColumn = model.getLineContent(startLine).search(/\S/) + 1;
        const statementEndColumn = model.getLineContent(endLine).trimEnd().length + 1;
        const selection = editor.getSelection();
        const selectionMatchesStatement =
            Boolean(selection && !selection.isEmpty()) &&
            selection?.startLineNumber === startLine &&
            selection.startColumn === statementStartColumn &&
            selection.endLineNumber === endLine &&
            selection.endColumn === statementEndColumn;
        editor.getDomNode()?.classList.toggle(OUTLINE_ONLY_CLASS, selectionMatchesStatement);

        const layout = editor.getLayoutInfo();
        const scrollLeft = editor.getScrollLeft();
        const scrollTop = editor.getScrollTop();
        const rects: StatementLineRect[] = [];

        for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
            const line = model.getLineContent(lineNumber);
            const startColumn = lineNumber === startLine ? line.search(/\S/) + 1 : 1;
            const endColumn = line.trimEnd().length + 1;
            const startOffset = editor.getOffsetForColumn(lineNumber, startColumn);
            const endOffset = editor.getOffsetForColumn(lineNumber, endColumn);
            if (startOffset < 0 || endOffset < 0) {
                clear();
                return;
            }

            const top = editor.getTopForLineNumber(lineNumber) - scrollTop;
            rects.push({
                left: layout.contentLeft + startOffset - scrollLeft,
                right: layout.contentLeft + endOffset - scrollLeft,
                top,
                bottom: top + editor.getLineHeightForPosition({ lineNumber, column: startColumn }),
            });
        }

        domNode.style.width = `${layout.width}px`;
        domNode.style.height = `${layout.height}px`;
        svg.setAttribute('width', String(layout.width));
        svg.setAttribute('height', String(layout.height));
        outline.setAttribute('d', buildOutlinePath(rects));
    };

    const scheduleUpdate = () => {
        if (disposed || scheduled) return;
        scheduled = true;
        window.setTimeout(() => {
            scheduled = false;
            render();
        }, 0);
    };

    const cursorDisposable = editor.onDidChangeCursorPosition(scheduleUpdate);
    const selectionDisposable = editor.onDidChangeCursorSelection(scheduleUpdate);
    const contentDisposable = editor.onDidChangeModelContent(scheduleUpdate);
    const scrollDisposable = editor.onDidScrollChange(scheduleUpdate);
    const layoutDisposable = editor.onDidLayoutChange(scheduleUpdate);
    scheduleUpdate();

    return {
        dispose: () => {
            disposed = true;
            cursorDisposable.dispose();
            selectionDisposable.dispose();
            contentDisposable.dispose();
            scrollDisposable.dispose();
            layoutDisposable.dispose();
            editor.getDomNode()?.classList.remove(OUTLINE_ONLY_CLASS);
            editor.removeOverlayWidget(widget);
        },
    };
}
