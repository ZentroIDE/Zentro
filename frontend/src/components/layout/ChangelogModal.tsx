// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui';
import changelogMd from '../../../../CHANGELOG.md?raw';

interface ChangelogModalProps {
    onClose: () => void;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({ onClose }) => {
    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent className='p-0 max-w-2xl h-[80vh] max-h-200 overflow-hidden'>
                <DialogHeader>
                    <DialogTitle>Changelog</DialogTitle>
                </DialogHeader>
                <div className='min-h-0 flex-1 overflow-y-auto p-6 text-small leading-relaxed markdown-body'>
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            h1: ({ node, ...props }) => (
                                <h1
                                    className='text-title mt-2 mb-4 pb-2 border-b border-border'
                                    {...props}
                                />
                            ),
                            h2: ({ node, ...props }) => (
                                <h2 className='text-title mt-6 mb-3 text-accent' {...props} />
                            ),
                            h3: ({ node, ...props }) => (
                                <h3 className='text-section mt-5 mb-2' {...props} />
                            ),
                            ul: ({ node, ...props }) => (
                                <ul
                                    className='list-disc pl-5 mb-4 space-y-1 text-muted-foreground'
                                    {...props}
                                />
                            ),
                            li: ({ node, ...props }) => <li className='pl-1' {...props} />,
                            a: ({ node, ...props }) => (
                                <a
                                    className='text-accent hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background'
                                    target='_blank'
                                    rel='noreferrer'
                                    {...props}
                                />
                            ),
                            p: ({ node, ...props }) => (
                                <p className='mb-4 text-muted-foreground' {...props} />
                            ),
                            strong: ({ node, ...props }) => (
                                <strong className='font-semibold text-foreground' {...props} />
                            ),
                        }}
                    >
                        {changelogMd}
                    </ReactMarkdown>
                </div>
            </DialogContent>
        </Dialog>
    );
};
