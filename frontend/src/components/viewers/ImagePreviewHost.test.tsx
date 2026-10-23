// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BlobPreviewButton } from './BlobViewer';
import { ImagePreviewHost } from './ImagePreviewHost';

const A = 'https://cdn.example.com/a.png';
const B = 'https://cdn.example.com/b.png';

describe('ImagePreviewHost', () => {
    it('serves every cell trigger from one dialog', async () => {
        render(
            <ImagePreviewHost>
                <BlobPreviewButton value={A} />
                <BlobPreviewButton value={B} />
            </ImagePreviewHost>,
        );

        const triggers = screen.getAllByTitle('Preview image');
        expect(triggers).toHaveLength(2);
        expect(screen.queryByRole('dialog')).toBeNull();

        fireEvent.click(triggers[1]);

        const image = await screen.findByAltText('Full size');
        expect(image).toHaveAttribute('src', B);
        // Two triggers, still a single dialog: the host owns it, not the cells.
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
    });

    it('switches the shared dialog to whichever trigger was clicked', async () => {
        render(
            <ImagePreviewHost>
                <BlobPreviewButton value={A} />
                <BlobPreviewButton value={B} />
            </ImagePreviewHost>,
        );

        const triggers = screen.getAllByTitle('Preview image');
        fireEvent.click(triggers[0]);
        expect(await screen.findByAltText('Full size')).toHaveAttribute('src', A);

        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        fireEvent.click(screen.getAllByTitle('Preview image')[1]);
        expect(await screen.findByAltText('Full size')).toHaveAttribute('src', B);
    });

    it('clears a previous load failure when a different image is opened', async () => {
        render(
            <ImagePreviewHost>
                <BlobPreviewButton value={A} />
                <BlobPreviewButton value={B} />
            </ImagePreviewHost>,
        );

        const triggers = screen.getAllByTitle('Preview image');
        fireEvent.click(triggers[0]);
        fireEvent.error(await screen.findByAltText('Full size'));
        expect(await screen.findByText('Failed to load image')).toBeInTheDocument();

        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        fireEvent.click(screen.getAllByTitle('Preview image')[1]);
        // The error belonged to the previous image, not to this one.
        expect(await screen.findByAltText('Full size')).toHaveAttribute('src', B);
    });

    it('still previews when rendered without a host', async () => {
        render(<BlobPreviewButton value={A} />);

        fireEvent.click(screen.getByTitle('Preview image'));

        expect(await screen.findByAltText('Full size')).toHaveAttribute('src', A);
    });
});
