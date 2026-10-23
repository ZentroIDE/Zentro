// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import {
    detectImageType,
    isBlobValue,
    isLikelyImageUrl,
    resolveImageSrc,
    sniffImageMimeFromBase64,
} from './BlobViewer';

const bytesToBase64 = (bytes: number[]): string => btoa(String.fromCharCode(...bytes));

const PNG_HEADER = [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x00, 0x00,
];
const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01];
const GIF_HEADER = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

describe('sniffImageMimeFromBase64', () => {
    it('identifies PNG magic bytes', () => {
        expect(sniffImageMimeFromBase64(bytesToBase64(PNG_HEADER))).toBe('image/png');
    });

    it('identifies JPEG magic bytes', () => {
        expect(sniffImageMimeFromBase64(bytesToBase64(JPEG_HEADER))).toBe('image/jpeg');
    });

    it('identifies GIF magic bytes', () => {
        expect(sniffImageMimeFromBase64(bytesToBase64(GIF_HEADER))).toBe('image/gif');
    });

    it('returns null for non-image base64 payloads', () => {
        expect(sniffImageMimeFromBase64(btoa('just some plain text content here'))).toBeNull();
    });

    it('returns null for invalid base64', () => {
        expect(sniffImageMimeFromBase64('not-valid-base64!!!')).toBeNull();
    });
});

describe('isLikelyImageUrl', () => {
    it('accepts an https URL with a plain image extension', () => {
        expect(isLikelyImageUrl('https://cdn.example.com/photo.jpg')).toBe(true);
    });

    it('accepts an image URL with a query string', () => {
        expect(isLikelyImageUrl('https://cdn.example.com/photo.jpg?sig=abc123&exp=999')).toBe(true);
    });

    it('accepts an image URL with a hash fragment', () => {
        expect(isLikelyImageUrl('https://cdn.example.com/photo.png#preview')).toBe(true);
    });

    it('rejects a non-image URL', () => {
        expect(isLikelyImageUrl('https://example.com/page.html')).toBe(false);
    });

    it('rejects a non-URL string', () => {
        expect(isLikelyImageUrl('photo.jpg')).toBe(false);
    });

    it('accepts an extension-less CDN URL with resize/format query params (Unsplash)', () => {
        expect(
            isLikelyImageUrl(
                'https://plus.unsplash.com/premium_vector-1719858611039-66c134efa74d?q=80&w=880&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
            ),
        ).toBe(true);
    });

    it('rejects an extension-less URL with only a single, unrelated query param', () => {
        expect(isLikelyImageUrl('https://example.com/profile?w=100')).toBe(false);
    });

    it('accepts an extension-less URL with an explicit image format param', () => {
        expect(isLikelyImageUrl('https://images.example.com/asset/abc123?fm=webp')).toBe(true);
    });
});

describe('detectImageType', () => {
    it('detects a data:image/* URI regardless of column type', () => {
        expect(detectImageType(`data:image/png;base64,${bytesToBase64(PNG_HEADER)}`)).toBe(true);
    });

    it('detects a backend-encoded binary data URI by sniffing magic bytes', () => {
        const value = `data:application/octet-stream;base64,${bytesToBase64(PNG_HEADER)}`;
        expect(detectImageType(value, 'bytea')).toBe(true);
    });

    it('does not treat a backend-encoded non-image binary as an image', () => {
        const value = `data:application/octet-stream;base64,${btoa('not an image payload at all')}`;
        expect(detectImageType(value, 'bytea')).toBe(false);
    });

    it('detects an image URL in a plain text column', () => {
        expect(detectImageType('https://cdn.example.com/avatar.webp?v=2', 'varchar')).toBe(true);
    });

    it('detects raw base64 image content in a binary column', () => {
        expect(detectImageType(bytesToBase64(JPEG_HEADER), 'blob')).toBe(true);
    });

    it('does not flag plain text as an image', () => {
        expect(detectImageType('hello world', 'varchar')).toBe(false);
    });
});

describe('resolveImageSrc with forceUrl (manually marked image column)', () => {
    it('treats a plain https URL as an image URL even with zero heuristic signal', () => {
        const value = 'https://cdn.example.com/assets/abc123';
        // Without a mark, this URL has no extension and no query signature at
        // all — the heuristic correctly can't tell, so it falls through.
        expect(resolveImageSrc(value).isUrl).toBe(false);
        // With a manual mark, it's trusted outright.
        expect(resolveImageSrc(value, true)).toEqual({ src: value, mime: null, isUrl: true });
    });

    it('does not force a non-http value into a URL treatment', () => {
        const value = 'not-a-url-at-all';
        const resolved = resolveImageSrc(value, true);
        expect(resolved.isUrl).toBe(false);
    });
});

describe('isBlobValue', () => {
    it('treats any bytea/blob/binary column as a blob regardless of content', () => {
        expect(isBlobValue('anything', 'bytea')).toBe(true);
    });

    it('falls back to image detection for non-binary columns', () => {
        expect(isBlobValue('https://cdn.example.com/photo.png', 'varchar')).toBe(true);
        expect(isBlobValue('hello world', 'varchar')).toBe(false);
    });

    it('returns false for an empty value', () => {
        expect(isBlobValue('', 'bytea')).toBe(false);
    });

    it('skips the redundant detectImageType re-check when the caller already ran it', () => {
        // A caller that already computed detectImageType(value, type) === false
        // can pass alreadyKnownNotImage to skip re-running the same heuristic.
        expect(isBlobValue('https://cdn.example.com/photo.png', 'varchar', true)).toBe(false);
        expect(isBlobValue('hello world', 'varchar', true)).toBe(false);
        // The binary-type short-circuit still wins regardless of the flag.
        expect(isBlobValue('anything', 'bytea', true)).toBe(true);
    });
});
