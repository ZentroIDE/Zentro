// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ToastProvider } from './components/layout/Toast';
import { useSettingsStore } from './stores/settingsStore';
import { ErrorBoundary } from './components/layout/ErrorBoundary';

// Pro code is found by path (ADR 0019): a tree built without frontend/src/pro/
// still resolves this glob, just to an empty object, so nothing here needs a
// stub or an alias. Core never imports anything under pro/ directly.
import.meta.glob('./pro/index.{ts,tsx}', { eager: true });

const container = document.getElementById('root');
const root = createRoot(container!);

const Root = () => {
    const toastPlacement = useSettingsStore(s => s.toastPlacement);

    return (
        <React.StrictMode>
            <ErrorBoundary>
                <ToastProvider placement={toastPlacement}>
                    <App />
                </ToastProvider>
            </ErrorBoundary>
        </React.StrictMode>
    );
};

root.render(<Root />);
