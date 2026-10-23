// SPDX-License-Identifier: GPL-3.0-only

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    pluginId: string;
    fallback?: ReactNode;
    children: ReactNode;
    onError?: (pluginId: string, error: Error) => void;
}

interface State {
    hasError: boolean;
}

export class PluginErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        const { pluginId, onError } = this.props;
        const msg = `[plugin:${pluginId}] render error: ${error.message}`;
        console.error(msg, info.componentStack);
        onError?.(pluginId, error);
    }

    render() {
        if (this.state.hasError) {
            return (
                this.props.fallback ?? (
                    <span
                        title={`Plugin ${this.props.pluginId} crashed`}
                        className='inline-flex items-center gap-1 rounded-md bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive'
                    >
                        ⚠ {this.props.pluginId}
                    </span>
                )
            );
        }
        return this.props.children;
    }
}
