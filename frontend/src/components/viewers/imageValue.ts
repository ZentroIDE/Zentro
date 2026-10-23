// SPDX-License-Identifier: GPL-3.0-only

/**
 * Pure value-level image handling for data-grid cells: format detection, source
 * resolution and download.
 *
 * Deliberately free of React. The cell renderers and the shared preview dialog
 * both need these, and keeping them here is what lets those two modules stay
 * independent of each other instead of forming an import cycle.
 */

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
const IMAGE_MIMES = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/svg+xml',
];

const BINARY_OCTET_STREAM_PREFIX = 'data:application/octet-stream;base64,';

const MAGIC_NUMBER_SNIFFERS: Array<{ mime: string; matches: (bytes: Uint8Array) => boolean }> = [
    {
        mime: 'image/png',
        matches: b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
    },
    { mime: 'image/jpeg', matches: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    {
        mime: 'image/gif',
        matches: b => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
    },
    { mime: 'image/bmp', matches: b => b[0] === 0x42 && b[1] === 0x4d },
    {
        mime: 'image/webp',
        matches: b =>
            b[0] === 0x52 &&
            b[1] === 0x49 &&
            b[2] === 0x46 &&
            b[3] === 0x46 &&
            b[8] === 0x57 &&
            b[9] === 0x45 &&
            b[10] === 0x42 &&
            b[11] === 0x50,
    },
];

/** Decodes only the leading bytes of a base64 payload to identify the real image format,
 *  since binary columns arrive without a trustworthy declared mime type. */
const sniffImageMimeFromBase64 = (base64: string): string | null => {
    try {
        const head = atob(base64.slice(0, 20));
        const bytes = new Uint8Array(head.length);
        for (let i = 0; i < head.length; i += 1) {
            bytes[i] = head.charCodeAt(i);
        }
        const sniffer = MAGIC_NUMBER_SNIFFERS.find(s => s.matches(bytes));
        return sniffer?.mime ?? null;
    } catch {
        return null;
    }
};

// Image CDNs (Unsplash, imgix, Cloudinary, Contentful, ...) commonly serve
// images from extension-less paths and rely on resize/format query params
// instead — e.g. https://plus.unsplash.com/premium_vector-xyz?q=80&w=880&
// auto=format&fit=crop has no ".jpg" anywhere, so an extension-only check
// misses it entirely.
const IMAGE_QUERY_FORMAT_PARAMS = ['fm', 'fmt', 'format'];
const IMAGE_QUERY_TRANSFORM_PARAMS = ['w', 'h', 'width', 'height', 'fit', 'crop', 'dpr', 'auto'];

const hasImageCdnQuerySignature = (value: string): boolean => {
    const queryIndex = value.indexOf('?');
    if (queryIndex === -1) return false;
    const params = new URLSearchParams(value.slice(queryIndex));
    if (
        IMAGE_QUERY_FORMAT_PARAMS.some(key =>
            IMAGE_EXTENSIONS.includes(params.get(key)?.toLowerCase() ?? ''),
        )
    ) {
        return true;
    }
    // Require at least two resize/transform signals together so a random
    // `?w=…` on an unrelated URL doesn't get flagged as an image.
    const transformHits = IMAGE_QUERY_TRANSFORM_PARAMS.filter(key => params.has(key)).length;
    return transformHits >= 2;
};

const isLikelyImageUrl = (value: string): boolean => {
    if (!/^https?:\/\//i.test(value)) return false;
    const path = value.split(/[?#]/)[0];
    const ext = path.split('.').pop()?.toLowerCase();
    if (ext && IMAGE_EXTENSIONS.includes(ext)) return true;
    return hasImageCdnQuerySignature(value);
};

const looksLikeRawBase64 = (value: string): boolean =>
    value.length > 8 &&
    !value.includes(' ') &&
    !value.includes('\n') &&
    /^[A-Za-z0-9+/]+=*$/.test(value);

const detectImageType = (value: string, columnType?: string): boolean => {
    const lowerType = columnType?.toLowerCase() || '';
    const lowerVal = value.toLowerCase().trim();

    if (IMAGE_MIMES.some(mime => lowerType.includes(mime))) return true;
    if (value.startsWith('data:image/')) return true;
    if (value.startsWith(BINARY_OCTET_STREAM_PREFIX)) {
        return sniffImageMimeFromBase64(value.slice(BINARY_OCTET_STREAM_PREFIX.length)) !== null;
    }
    if (isLikelyImageUrl(value)) return true;

    const isBinaryColumn =
        lowerType.includes('bytea') || lowerType.includes('blob') || lowerType.includes('binary');
    if (isBinaryColumn && looksLikeRawBase64(value)) {
        return sniffImageMimeFromBase64(value) !== null;
    }

    if (value.length > 8 && !value.includes(' ') && !value.includes('\n')) {
        const ext = lowerVal.split('.').pop();
        if (ext && IMAGE_EXTENSIONS.includes(ext)) return true;
    }

    return false;
};

/** Resolves the actual <img> src plus the mime to use for downloads, since binary
 *  columns and URL columns need very different handling to display/save correctly.
 *  `forceUrl` comes from a user-marked "Image Column" — it means the value should
 *  be treated as an image URL outright, bypassing `isLikelyImageUrl`'s heuristic,
 *  since a manual mark exists precisely for CDNs with no extension and no
 *  resize-query-param signature at all (pure content negotiation). */
const resolveImageSrc = (
    value: string,
    forceUrl?: boolean,
): { src: string; mime: string | null; isUrl: boolean } => {
    if (value.startsWith('data:image/')) {
        const mime = value.slice(5, value.indexOf(';'));
        return { src: value, mime, isUrl: false };
    }
    if (value.startsWith(BINARY_OCTET_STREAM_PREFIX)) {
        const base64 = value.slice(BINARY_OCTET_STREAM_PREFIX.length);
        const mime = sniffImageMimeFromBase64(base64) ?? 'image/png';
        return { src: `data:${mime};base64,${base64}`, mime, isUrl: false };
    }
    if (isLikelyImageUrl(value) || (forceUrl && /^https?:\/\//i.test(value))) {
        return { src: value, mime: null, isUrl: true };
    }
    const mime = sniffImageMimeFromBase64(value) ?? 'image/png';
    return { src: `data:${mime};base64,${value}`, mime, isUrl: false };
};

const getByteSize = (value: string): number => {
    try {
        const base64Match = value.match(/^data:[^;]+;base64,(.+)$/);
        if (base64Match) {
            return atob(base64Match[1]).length;
        }
        return new Blob([value]).size;
    } catch {
        return value.length;
    }
};

const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const MIME_TO_EXTENSION: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
};

const downloadImage = async (src: string, mime: string | null, isUrl: boolean): Promise<void> => {
    try {
        if (isUrl) {
            const response = await fetch(src);
            const blob = await response.blob();
            triggerDownload(URL.createObjectURL(blob), blob.type);
            return;
        }
        const base64Match = src.match(/^data:([^;]+);base64,(.+)$/);
        if (base64Match) {
            const [, matchedMime, base64] = base64Match;
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: matchedMime });
            triggerDownload(URL.createObjectURL(blob), matchedMime);
            return;
        }
        const blob = new Blob([src], { type: mime ?? 'application/octet-stream' });
        triggerDownload(URL.createObjectURL(blob), mime ?? 'application/octet-stream');
    } catch (err) {
        if (isUrl) {
            window.open(src, '_blank', 'noopener,noreferrer');
            return;
        }
        console.error('Download failed:', err);
    }
};

const triggerDownload = (objectUrl: string, mime: string): void => {
    const ext = MIME_TO_EXTENSION[mime] ?? 'bin';
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `image_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
};

/** `alreadyKnownNotImage` lets a caller that already ran `detectImageType` with the
 *  same `(value, columnType)` skip re-running it here — it's a pure function, so a
 *  prior `false` result guarantees this fallback would also be `false`. Avoids
 *  doubling the regex/heuristic cost of `detectImageType` per non-image cell. */
const isBlobValue = (
    value: string,
    columnType?: string,
    alreadyKnownNotImage?: boolean,
): boolean => {
    if (!value) return false;
    const lowerType = columnType?.toLowerCase() || '';
    if (
        lowerType.includes('bytea') ||
        lowerType.includes('blob') ||
        lowerType.includes('binary') ||
        lowerType.includes('byte')
    ) {
        return true;
    }
    return alreadyKnownNotImage ? false : detectImageType(value, columnType);
};

export {
    detectImageType,
    downloadImage,
    formatBytes,
    getByteSize,
    isBlobValue,
    isLikelyImageUrl,
    resolveImageSrc,
    sniffImageMimeFromBase64,
};
