// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Download, Image as ImageIcon } from 'lucide-react';

import { Button } from '../ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

import { downloadImage, resolveImageSrc } from './imageValue';
import {
    ImagePreviewContext,
    type ImagePreviewOpener,
    type ImagePreviewRequest,
} from './imagePreviewContext';

interface ImagePreviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    request: ImagePreviewRequest | null;
}

/** The full-size preview itself. One instance serves every cell under a host. */
export const ImagePreviewDialog: React.FC<ImagePreviewDialogProps> = ({
    open,
    onOpenChange,
    request,
}) => {
    const [failed, setFailed] = React.useState(false);
    const resolved = React.useMemo(
        () => (request ? resolveImageSrc(request.value, request.markedAsImage) : null),
        [request],
    );

    // A new image gets a fresh shot at loading, otherwise one broken source
    // would leave the error state stuck for every image opened afterwards.
    React.useEffect(() => {
        setFailed(false);
    }, [resolved]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size='lg'>
                <DialogHeader>
                    <DialogTitle>Image Preview</DialogTitle>
                </DialogHeader>
                <div className='px-4 pb-4 flex flex-col items-center gap-3'>
                    {failed || !resolved ? (
                        <div className='blob-image-error'>
                            <ImageIcon size={16} />
                            <span>Failed to load image</span>
                        </div>
                    ) : (
                        <img
                            src={resolved.src}
                            alt='Full size'
                            className='blob-image-full'
                            onError={() => setFailed(true)}
                        />
                    )}
                    <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        disabled={!resolved}
                        onClick={() => {
                            if (!resolved) return;
                            void downloadImage(resolved.src, resolved.mime, resolved.isUrl);
                        }}
                        title='Download'
                    >
                        <Download size={12} />
                        <span>Download</span>
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

/**
 * Mounts one image preview dialog for everything rendered inside it.
 *
 * Wrap any surface that renders many image cells at once. Without it each cell
 * carries its own dialog, and in a virtualized grid that is a full dialog
 * component tree mounted and discarded per row on every scroll.
 *
 * `children` is taken as a prop and rendered untouched, so opening or closing
 * the preview re-renders this host alone and never the grid beneath it.
 */
export const ImagePreviewHost: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [request, setRequest] = React.useState<ImagePreviewRequest | null>(null);

    // Stable for the life of the host: cells memoize against this, so a new
    // identity here would re-render every visible cell.
    const openPreview = React.useCallback<ImagePreviewOpener>(next => setRequest(next), []);

    return (
        <ImagePreviewContext.Provider value={openPreview}>
            {children}
            <ImagePreviewDialog
                open={request !== null}
                onOpenChange={next => {
                    if (!next) setRequest(null);
                }}
                request={request}
            />
        </ImagePreviewContext.Provider>
    );
};
