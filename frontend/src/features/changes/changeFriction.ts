// SPDX-License-Identifier: GPL-3.0-only

export type ChangeFriction = {
    requireTypedConfirm: boolean;
    cooldownSeconds: number;
};

export function changeFriction(opts: {
    env: string;
    requiresTypedConfirm: boolean;
    cooldownSeconds: number;
    canTypeToConfirm: boolean;
    canCooldown: boolean;
}): ChangeFriction {
    const pro = opts.env.toLowerCase() === 'pro';
    return {
        requireTypedConfirm: opts.canTypeToConfirm && (pro || opts.requiresTypedConfirm),
        cooldownSeconds: pro && opts.canCooldown ? Math.max(opts.cooldownSeconds, 3) : 0,
    };
}

export function approveEnabled(opts: {
    friction: ChangeFriction;
    confirmation: string;
    env: string;
    cooldownRemainingMs: number;
}): boolean {
    if (
        opts.friction.requireTypedConfirm &&
        opts.confirmation.trim().toLowerCase() !== opts.env.toLowerCase()
    ) {
        return false;
    }
    if (opts.friction.cooldownSeconds > 0 && opts.cooldownRemainingMs > 0) {
        return false;
    }
    return true;
}
