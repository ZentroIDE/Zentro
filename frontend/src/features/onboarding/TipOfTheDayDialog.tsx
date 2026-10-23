// SPDX-License-Identifier: GPL-3.0-only

import React, { useMemo, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { TIPS, todayTipIndex } from '../../lib/tips';
import { setShowTipsOnStartup, shouldShowTipsOnStartup } from './tipOfTheDayFlag';
import {
    Button,
    Checkbox,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../components/ui';

interface TipOfTheDayDialogProps {
    open: boolean;
    onClose: () => void;
}

export const TipOfTheDayDialog: React.FC<TipOfTheDayDialogProps> = ({ open, onClose }) => {
    const tip = useMemo(() => TIPS[todayTipIndex()], []);
    const [showOnStartup, setShowOnStartup] = useState(shouldShowTipsOnStartup);

    if (!open) return null;

    const handleShowOnStartupChange = (checked: boolean) => {
        setShowOnStartup(checked);
        setShowTipsOnStartup(checked);
    };

    return (
        <Dialog open={open} onOpenChange={v => !v && onClose()}>
            <DialogContent size='sm' className='p-0 overflow-hidden'>
                <DialogHeader className='flex flex-row items-center gap-2.5'>
                    <Lightbulb size={18} className='text-accent shrink-0' strokeWidth={2.5} />
                    <DialogTitle>Tip of the Day</DialogTitle>
                </DialogHeader>

                <div className='px-4 pb-3 space-y-1.5 min-h-20'>
                    <p className='text-small font-semibold text-foreground'>{tip.title}</p>
                    <p className='text-label text-muted-foreground'>{tip.body}</p>
                </div>

                <DialogFooter className='justify-between'>
                    <label className='flex items-center gap-2 text-label text-muted-foreground'>
                        <Checkbox
                            checked={showOnStartup}
                            onCheckedChange={value => handleShowOnStartupChange(value === true)}
                        />
                        Show tips on startup
                    </label>
                    <Button variant='default' size='sm' onClick={onClose}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
