// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';

import { decodeBase64Bytes } from './events';

describe('decodeBase64Bytes', () => {
    it('decodes plain text', () => {
        expect(new TextDecoder().decode(decodeBase64Bytes(btoa('hello')))).toBe('hello');
    });

    it('keeps bytes that are not valid UTF-8 intact', () => {
        const raw = Uint8Array.from([0x68, 0xff, 0xfe, 0x00, 0x1b, 0x5b, 0x32, 0x4a]);
        const encoded = btoa(String.fromCharCode(...raw));

        expect(Array.from(decodeBase64Bytes(encoded))).toEqual(Array.from(raw));
    });

    it('decodes an empty payload to no bytes', () => {
        expect(decodeBase64Bytes('')).toHaveLength(0);
    });
});
