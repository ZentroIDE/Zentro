// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { BrowserOpenURL } from '../../../../wailsjs/runtime/runtime';
import appIcon from '../../../assets/images/appicon.png';
import { EULA_URL, PRIVACY_POLICY_URL, TERMS_URL } from '../../../lib/appUrls';
import { getTelemetryConsent, setTelemetryConsent } from '../../../features/telemetry/consent';
import { markPrivacyNoticeAccepted } from '../../../features/telemetry/privacyNotice';
import { SettingToggle } from '../settings/SettingItem';
import {
    Button,
    Checkbox,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../ui';

interface PrivacyNoticeDialogProps {
    onAccept: () => void;
}

// A couple of px of slack so rounding on the scroll math doesn't leave the
// checkbox permanently unreachable on some zoom levels.
const SCROLL_END_EPSILON = 4;

/**
 * One-time gate shown before a user's first Project is created - summarizes
 * what Zentro does/doesn't collect (full detail lives at the linked Privacy
 * Policy/Terms/EULA pages, not duplicated here) and requires scrolling the
 * summary to the end before the acknowledgement checkbox can be checked.
 * Also the first place the existing (previously UI-less) telemetry opt-in
 * can be turned on. See markPrivacyNoticeAccepted for the persisted flag.
 */
export const PrivacyNoticeDialog: React.FC<PrivacyNoticeDialogProps> = ({ onAccept }) => {
    const [hasScrolledToEnd, setHasScrolledToEnd] = React.useState(false);
    const [agreed, setAgreed] = React.useState(false);
    const [telemetryOptIn, setTelemetryOptIn] = React.useState(() => getTelemetryConsent().optedIn);

    // If the summary already fits without a scrollbar, there's nothing to
    // scroll to - waiting for a scroll event that can never fire would leave
    // the checkbox permanently disabled instead of "already shown in full".
    // A callback ref (not useRef+useEffect) because Radix's Dialog mounts
    // this content through its own Presence/portal machinery, which can
    // commit the node a tick after this component's own mount effect runs -
    // a callback ref fires exactly when the node itself actually attaches.
    const summaryRef = React.useCallback((el: HTMLDivElement | null) => {
        if (el && el.scrollHeight <= el.clientHeight + SCROLL_END_EPSILON) {
            setHasScrolledToEnd(true);
        }
    }, []);

    const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
        if (hasScrolledToEnd) return;
        const el = event.currentTarget;
        if (el.scrollHeight - el.scrollTop <= el.clientHeight + SCROLL_END_EPSILON) {
            setHasScrolledToEnd(true);
        }
    };

    const handleContinue = () => {
        if (!agreed) return;
        setTelemetryConsent(telemetryOptIn);
        markPrivacyNoticeAccepted();
        onAccept();
    };

    return (
        <Dialog open onOpenChange={() => {}}>
            <DialogContent
                size='lg'
                showCloseButton={false}
                onEscapeKeyDown={event => event.preventDefault()}
                onPointerDownOutside={event => event.preventDefault()}
                onInteractOutside={event => event.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Before you get started</DialogTitle>
                </DialogHeader>

                <div
                    ref={summaryRef}
                    className='flex max-h-96 gap-5 overflow-y-auto px-4 py-3'
                    onScroll={handleScroll}
                >
                    <div className='flex w-72 shrink-0 flex-col items-center gap-3 text-center'>
                        <img src={appIcon} alt='' aria-hidden='true' className='h-72 w-72' />
                        <div className='flex flex-wrap items-center justify-center gap-x-2 gap-y-1'>
                            <Button
                                type='button'
                                variant='link'
                                className='text-label border-none!'
                                onClick={() => BrowserOpenURL(PRIVACY_POLICY_URL)}
                            >
                                Privacy Policy
                            </Button>
                            <Button
                                type='button'
                                variant='link'
                                className='text-label border-none!'
                                onClick={() => BrowserOpenURL(TERMS_URL)}
                            >
                                Terms of Service
                            </Button>
                            <Button
                                type='button'
                                variant='link'
                                className='text-label border-none!'
                                onClick={() => BrowserOpenURL(EULA_URL)}
                            >
                                EULA
                            </Button>
                        </div>
                    </div>

                    <div className='min-w-0 flex-1 space-y-3 text-small text-foreground'>
                        <p>
                            Zentro is a local-first SQL IDE. Here&apos;s what that means for your
                            data, in short:
                        </p>
                        <ul className='list-disc space-y-1.5 pl-5'>
                            <li>
                                <strong>We never see your data.</strong> Database credentials, query
                                content, and any data from the databases you connect to stay on your
                                machine — every query runs locally, none of it is transmitted to us.
                            </li>
                            <li>
                                <strong>What we do collect:</strong> an installation ID, your
                                platform/OS, app version, and a heartbeat timestamp, used to run
                                license checks and updates. If you activate Pro, also your email and
                                which Pro features you use.
                            </li>
                            <li>
                                <strong>Third parties</strong>, only if you use the related feature:
                                our payment processor (Pro purchases), our email provider (license
                                emails), and optional error reporting.
                            </li>
                            <li>
                                We don&apos;t sell or share your data, and we don&apos;t run ads.
                            </li>
                        </ul>

                        <SettingToggle
                            title='Send anonymous usage data'
                            description='Optional, off by default — helps us see which features are actually used.'
                            checked={telemetryOptIn}
                            onCheckedChange={setTelemetryOptIn}
                        />
                        <div>
                            <label className='flex items-center gap-2 text-small text-foreground'>
                                <Checkbox
                                    checked={agreed}
                                    disabled={!hasScrolledToEnd}
                                    onCheckedChange={value => setAgreed(value === true)}
                                />
                                <span>
                                    I have read and agree to Zentro&apos;s Privacy Policy, Terms of
                                    Service, and EULA.
                                    {!hasScrolledToEnd && (
                                        <span className='text-muted-foreground'>
                                            {' '}
                                            Scroll to the end to continue.
                                        </span>
                                    )}
                                </span>
                            </label>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant='default' disabled={!agreed} onClick={handleContinue}>
                        Continue
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
