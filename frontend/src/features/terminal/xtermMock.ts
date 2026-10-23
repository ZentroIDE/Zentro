// SPDX-License-Identifier: GPL-3.0-only

// Test double for @xterm/xterm and @xterm/addon-fit: jsdom has no canvas, and
// the tests only need to see what was written to a terminal and to drive its
// input/resize callbacks. Used via vi.mock factories in the terminal tests.

type DataListener = (data: string) => void;
type ResizeListener = (size: { cols: number; rows: number }) => void;

export class FakeTerminal {
    static instances: FakeTerminal[] = [];

    writes: Array<string | Uint8Array> = [];
    opened = false;
    disposed = false;
    focused = false;
    options: Record<string, unknown> = {};
    element: HTMLElement | undefined;
    private dataListeners: DataListener[] = [];
    private resizeListeners: ResizeListener[] = [];

    constructor(options: Record<string, unknown> = {}) {
        this.options = { ...options };
        FakeTerminal.instances.push(this);
    }

    loadAddon(): void {}

    open(host: HTMLElement): void {
        this.opened = true;
        this.element = document.createElement('div');
        this.element.className = 'xterm';
        host.appendChild(this.element);
    }

    onData(listener: DataListener): void {
        this.dataListeners.push(listener);
    }

    onResize(listener: ResizeListener): void {
        this.resizeListeners.push(listener);
    }

    write(data: string | Uint8Array): void {
        this.writes.push(data);
    }

    focus(): void {
        this.focused = true;
    }

    selection = '';
    private keyHandler: ((event: KeyboardEvent) => boolean) | undefined;

    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
        this.keyHandler = handler;
    }

    hasSelection(): boolean {
        return this.selection !== '';
    }

    getSelection(): string {
        return this.selection;
    }

    clearSelection(): void {
        this.selection = '';
    }

    /** A key press as xterm would route it; false means the shell never sees it. */
    press(event: KeyboardEvent): boolean {
        return this.keyHandler ? this.keyHandler(event) : true;
    }

    dispose(): void {
        this.disposed = true;
    }

    /** What the user typed, as xterm would report it. */
    type(data: string): void {
        this.dataListeners.forEach(listener => listener(data));
    }

    /** The viewport changed size. */
    resizeTo(cols: number, rows: number): void {
        this.resizeListeners.forEach(listener => listener({ cols, rows }));
    }

    text(): string {
        const decoder = new TextDecoder();
        return this.writes
            .map(chunk => (typeof chunk === 'string' ? chunk : decoder.decode(chunk)))
            .join('');
    }
}

export class FakeFitAddon {
    static fits = 0;
    fit(): void {
        FakeFitAddon.fits++;
    }
}

export function resetXtermMock(): void {
    FakeTerminal.instances = [];
    FakeFitAddon.fits = 0;
}
