// SPDX-License-Identifier: GPL-3.0-only

/// <reference types="vite/client" />

type WailsWindowApi = Record<string, (...args: unknown[]) => unknown>;

interface Window {
    go?: {
        app?: {
            App?: WailsWindowApi;
        };
    };
}

// Type stub for @tailwindcss/vite — needed for TS 4.6 (moduleResolution: Node)
declare module '@tailwindcss/vite' {
    import type { Plugin } from 'vite';
    export default function tailwindcss(): Plugin;
}

// Monaco ships the SQL word lists as plain data with no type declarations.
declare module 'monaco-editor/esm/vs/basic-languages/sql/sql' {
    export const language: {
        keywords: string[];
        operators: string[];
        builtinFunctions: string[];
        builtinVariables: string[];
        pseudoColumns: string[];
    };
}

// Internals used only by the real-Monaco parity test.
declare module 'monaco-editor/esm/vs/editor/common/languages' {
    export const TokenizationRegistry: unknown;
}
declare module 'monaco-editor/esm/vs/editor/standalone/common/themes' {
    export const vs: unknown;
    export const vs_dark: unknown;
}
