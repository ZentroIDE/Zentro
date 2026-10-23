// SPDX-License-Identifier: GPL-3.0-only

import React, { useMemo, useState } from 'react';
import { Download, File, Image as ImageIcon } from 'lucide-react';
import { Button } from '../ui';

import {
    detectImageType,
    downloadImage,
    formatBytes,
    getByteSize,
    isBlobValue,
    isLikelyImageUrl,
    resolveImageSrc,
    sniffImageMimeFromBase64,
} from './imageValue';
import { ImagePreviewDialog } from './ImagePreviewHost';
import { useImagePreviewOpener } from './imagePreviewContext';

interface BlobViewerProps {
    value: string;
    columnType?: string;
    className?: string;
}

interface BlobPreviewButtonProps {
    value: string;
    columnType?: string;
    className?: string;
    /** True when the column was explicitly marked "Image" — bypasses the URL
     *  heuristic entirely so CDNs with no extension/query signature still preview. */
    markedAsImage?: boolean;
}

/** Static, so the class string is not rebuilt for every image cell on every
 *  scroll frame. */
const TRIGGER_CLASS =
    'blob-preview-trigger shrink-0 opacity-0 group-hover:opacity-100 transition-opacity';

const PreviewTrigger: React.FC<{ className: string; onOpen: () => void }> = ({
    className,
    onOpen,
}) => (
    <Button
        type='button'
        variant='ghost'
        size='icon'
        className={className}
        onClick={event => {
            event.stopPropagation();
            onOpen();
        }}
        title='Preview image'
    >
        <ImageIcon size={12} />
    </Button>
);

/** Fallback for triggers rendered outside an `ImagePreviewHost`: it owns its own
 *  dialog, which is correct but costs a full dialog tree per instance. */
const StandalonePreview: React.FC<BlobPreviewButtonProps & { triggerClass: string }> = ({
    value,
    columnType,
    markedAsImage = false,
    triggerClass,
}) => {
    const [open, setOpen] = useState(false);
    const request = useMemo(
        () => ({ value, columnType, markedAsImage }),
        [value, columnType, markedAsImage],
    );

    return (
        <>
            <PreviewTrigger className={triggerClass} onOpen={() => setOpen(true)} />
            <ImagePreviewDialog open={open} onOpenChange={setOpen} request={request} />
        </>
    );
};

/**
 * Hover-revealed icon that opens a full-size image modal without disturbing the
 * cell's normal text rendering (selection, copy, double-click-to-edit stay intact).
 *
 * Under an `ImagePreviewHost` this is a single button and nothing else. That
 * matters in the data grid, where one of these exists per rendered row.
 */
export const BlobPreviewButton: React.FC<BlobPreviewButtonProps> = ({
    value,
    columnType,
    className = '',
    markedAsImage = false,
}) => {
    const openPreview = useImagePreviewOpener();
    const triggerClass = className ? `${TRIGGER_CLASS} ${className}` : TRIGGER_CLASS;

    if (openPreview) {
        return (
            <PreviewTrigger
                className={triggerClass}
                onOpen={() => openPreview({ value, columnType, markedAsImage })}
            />
        );
    }

    return (
        <StandalonePreview
            value={value}
            columnType={columnType}
            markedAsImage={markedAsImage}
            triggerClass={triggerClass}
        />
    );
};

export const BlobViewer: React.FC<BlobViewerProps> = ({ value, className = '' }) => {
    const byteSize = useMemo(() => getByteSize(value), [value]);

    const handleGenericDownload = () => {
        void downloadImage(value, null, false);
    };

    if (!value || value === '\x00' || value === '') {
        return <span className={`blob-empty ${className}`}>NULL</span>;
    }

    return (
        <div className={`blob-viewer blob-generic ${className}`}>
            <div className='blob-info'>
                <File size={14} />
                <span>{formatBytes(byteSize)}</span>
            </div>
            <Button
                type='button'
                variant='ghost'
                size='icon'
                className='blob-download-btn'
                onClick={handleGenericDownload}
                title='Download binary data'
            >
                <Download size={12} />
            </Button>
        </div>
    );
};

export {
    detectImageType,
    isBlobValue,
    isLikelyImageUrl,
    resolveImageSrc,
    sniffImageMimeFromBase64,
};
