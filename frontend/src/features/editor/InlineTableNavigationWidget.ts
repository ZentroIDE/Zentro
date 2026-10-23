// SPDX-License-Identifier: GPL-3.0-only

import type { OnMount } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import type { TableNavigationMatch } from '../../lib/monaco/sqlTableNavigation';

type EditorPosition = Parameters<MonacoEditor.IStandaloneCodeEditor['setPosition']>[0];

export class InlineTableNavigationWidget implements MonacoEditor.IContentWidget {
    private readonly id = `zentro-table-nav-${crypto.randomUUID()}`;
    private readonly domNode: HTMLDivElement;
    private position: EditorPosition | null = null;
    private hideTimer: ReturnType<typeof setTimeout> | null = null;
    private keydownHandler: ((event: KeyboardEvent) => void) | null = null;
    private outsidePointerHandler: ((event: PointerEvent) => void) | null = null;
    private matches: TableNavigationMatch[] = [];
    private selectedIndex = 0;
    private onPick: ((match: TableNavigationMatch) => void) | null = null;

    constructor(
        private readonly editor: MonacoEditor.IStandaloneCodeEditor,
        private readonly monaco: Parameters<OnMount>[1],
    ) {
        this.domNode = document.createElement('div');
        this.domNode.className = 'zentro-table-nav-widget hidden';
        this.editor.addContentWidget(this);
    }

    getId(): string {
        return this.id;
    }

    getDomNode(): HTMLElement {
        return this.domNode;
    }

    getPosition(): MonacoEditor.IContentWidgetPosition | null {
        if (!this.position) return null;
        return {
            position: this.position,
            preference: [this.monaco.editor.ContentWidgetPositionPreference.BELOW],
        };
    }

    showHint(message: string, position: EditorPosition, timeoutMs = 1600) {
        this.clearPickerListeners();
        this.clearTimer();
        this.position = position;
        this.domNode.className = 'zentro-table-nav-widget zentro-table-nav-widget--hint';
        this.domNode.textContent = message;
        this.editor.layoutContentWidget(this);
        this.hideTimer = setTimeout(() => this.hide(), timeoutMs);
    }

    showPicker(
        matches: TableNavigationMatch[],
        position: EditorPosition,
        onPick: (match: TableNavigationMatch) => void,
    ) {
        this.clearTimer();
        this.clearPickerListeners();
        this.position = position;
        this.matches = matches;
        this.selectedIndex = 0;
        this.onPick = onPick;

        this.renderPicker();
        this.domNode.className = 'zentro-table-nav-widget zentro-table-nav-widget--picker';
        this.editor.layoutContentWidget(this);
        this.bindPickerListeners();
    }

    hide() {
        this.clearTimer();
        this.clearPickerListeners();
        this.position = null;
        this.matches = [];
        this.selectedIndex = 0;
        this.onPick = null;
        this.domNode.className = 'zentro-table-nav-widget hidden';
        this.domNode.innerHTML = '';
        this.editor.layoutContentWidget(this);
    }

    dispose() {
        this.hide();
        this.editor.removeContentWidget(this);
    }

    private renderPicker() {
        this.domNode.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'zentro-table-nav-widget__header';
        header.textContent = 'Choose table';
        this.domNode.appendChild(header);

        const list = document.createElement('div');
        list.className = 'zentro-table-nav-widget__list';
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-label', 'Table list');
        list.setAttribute('tabindex', '-1');

        this.matches.forEach((match, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.id = `zentro-table-nav-option-${index}`;
            button.className = 'zentro-table-nav-widget__item';
            button.setAttribute('role', 'option');
            button.setAttribute('aria-selected', index === this.selectedIndex ? 'true' : 'false');
            if (index === this.selectedIndex) {
                button.classList.add('is-active');
            }
            button.textContent = match.qualifiedName;
            button.addEventListener('mousedown', event => {
                event.preventDefault();
                event.stopPropagation();
            });
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                this.pickIndex(index);
            });
            list.appendChild(button);
        });

        const activeOptionId = `zentro-table-nav-option-${this.selectedIndex}`;
        list.setAttribute('aria-activedescendant', activeOptionId);

        this.domNode.appendChild(list);
    }

    private bindPickerListeners() {
        this.keydownHandler = (event: KeyboardEvent) => {
            if (!this.position || this.matches.length === 0) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                this.hide();
                return;
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                this.selectedIndex = (this.selectedIndex + 1) % this.matches.length;
                this.renderPicker();
                return;
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                this.selectedIndex =
                    (this.selectedIndex - 1 + this.matches.length) % this.matches.length;
                this.renderPicker();
                return;
            }
            if (event.key === 'Enter') {
                event.preventDefault();
                this.pickIndex(this.selectedIndex);
            }
        };

        this.outsidePointerHandler = (event: PointerEvent) => {
            if (!this.domNode.contains(event.target as Node)) {
                this.hide();
            }
        };

        window.addEventListener('keydown', this.keydownHandler, true);
        window.addEventListener('pointerdown', this.outsidePointerHandler, true);
    }

    private pickIndex(index: number) {
        const match = this.matches[index];
        if (!match || !this.onPick) return;
        this.onPick(match);
        this.hide();
    }

    private clearTimer() {
        if (!this.hideTimer) return;
        clearTimeout(this.hideTimer);
        this.hideTimer = null;
    }

    private clearPickerListeners() {
        if (this.keydownHandler) {
            window.removeEventListener('keydown', this.keydownHandler, true);
            this.keydownHandler = null;
        }
        if (this.outsidePointerHandler) {
            window.removeEventListener('pointerdown', this.outsidePointerHandler, true);
            this.outsidePointerHandler = null;
        }
    }
}
