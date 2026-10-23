// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from 'react';
import { useAuthStore } from '../features/auth/authStore';
import { configureApiGateway } from '../platform/apiGatewayRuntime';

export function useApiGatewayRuntime() {
    const provider = useAuthStore(state => state.provider);
    const session = useAuthStore(state => state.session);

    useEffect(() => {
        configureApiGateway({
            provider,
            session,
        });
    }, [provider, session]);
}
