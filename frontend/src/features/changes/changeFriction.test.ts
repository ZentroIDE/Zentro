// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { approveEnabled, changeFriction } from './changeFriction';

describe('changeFriction', () => {
    it('lets free plans approve with one click even on production', () => {
        const friction = changeFriction({
            env: 'pro',
            requiresTypedConfirm: true,
            cooldownSeconds: 3,
            canTypeToConfirm: false,
            canCooldown: false,
        });
        expect(friction.requireTypedConfirm).toBe(false);
        expect(friction.cooldownSeconds).toBe(0);
        expect(
            approveEnabled({ friction, confirmation: '', env: 'pro', cooldownRemainingMs: 3000 }),
        ).toBe(true);
    });

    it('requires the env name and cooldown on pro when the plan has those features', () => {
        const friction = changeFriction({
            env: 'pro',
            requiresTypedConfirm: false,
            cooldownSeconds: 3,
            canTypeToConfirm: true,
            canCooldown: true,
        });
        expect(friction.requireTypedConfirm).toBe(true);
        expect(friction.cooldownSeconds).toBe(3);
        expect(
            approveEnabled({ friction, confirmation: 'dev', env: 'pro', cooldownRemainingMs: 0 }),
        ).toBe(false);
        expect(
            approveEnabled({
                friction,
                confirmation: 'pro',
                env: 'pro',
                cooldownRemainingMs: 1500,
            }),
        ).toBe(false);
        expect(
            approveEnabled({ friction, confirmation: 'pro', env: 'pro', cooldownRemainingMs: 0 }),
        ).toBe(true);
    });

    it('uses one click on dev', () => {
        const friction = changeFriction({
            env: 'dev',
            requiresTypedConfirm: false,
            cooldownSeconds: 0,
            canTypeToConfirm: true,
            canCooldown: true,
        });
        expect(friction.requireTypedConfirm).toBe(false);
        expect(
            approveEnabled({ friction, confirmation: '', env: 'dev', cooldownRemainingMs: 0 }),
        ).toBe(true);
    });
});
