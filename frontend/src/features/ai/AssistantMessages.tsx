// SPDX-License-Identifier: GPL-3.0-only

import React, { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { CornerDownRight, Search } from 'lucide-react';
import { Button, ScrollArea } from '../../components/ui';
import { useAISettingsStore } from '../../stores/aiSettingsStore';
import { useAIChatStore } from '../../stores/aiChatStore';
import { visibleReplyText, type AISessionTurn } from '../../lib/aiAssistant';
import { usageLine } from '../../lib/aiTokens';
import { formatDuration, formatMessageTime } from '../../lib/aiTime';
import { AssistantSentRounds } from './AssistantSentRounds';
import { AssistantElapsed } from './AssistantElapsed';
import { AssistantRecentChats, recentChats } from './AssistantRecentChats';
import { AssistantMarkdown } from './AssistantMarkdown';

const NO_TURNS: AISessionTurn[] = [];

// withMentions colors the @names in a message the user sent.
function withMentions(text: string): React.ReactNode[] {
    return text.split(/(@[A-Za-z0-9_.:-]+)/g).map((part, index) =>
        part.startsWith('@') ? (
            <span key={index} className='text-(--interactive-text)'>
                {part}
            </span>
        ) : (
            <React.Fragment key={index}>{part}</React.Fragment>
        ),
    );
}

const PENDING_TURN_ID = 'pending';

interface ExchangeViewProps {
    exchange: Exchange;
    lastAssistant: AISessionTurn | undefined;
    busy: boolean;
    runLabel: string;
    onOpenSql: (sql: string, run: boolean) => void;
    onPickSuggestion: (text: string) => void;
}

// ExchangeView is one saved question with its replies. Its props only change
// when the chat does, so a reply streaming in below does not render it again.
const ExchangeView = memo(function ExchangeView({
    exchange,
    lastAssistant,
    busy,
    runLabel,
    onOpenSql,
    onPickSuggestion,
}: ExchangeViewProps) {
    const replies = exchange.replies.map(turn => (
        <TurnView
            key={turn.id}
            turn={turn}
            runLabel={runLabel}
            onOpenSql={onOpenSql}
            suggestions={
                turn === lastAssistant && (turn.suggestions?.length ?? 0) > 0 && !busy
                    ? turn.suggestions
                    : null
            }
            onPickSuggestion={onPickSuggestion}
        />
    ));
    if (!exchange.question) return <>{replies}</>;
    return (
        <ExchangeSection
            id={exchange.question.id}
            question={
                <UserMessage
                    text={exchange.question.text}
                    time={formatMessageTime(exchange.question.createdAt)}
                />
            }
        >
            {replies}
        </ExchangeSection>
    );
});

const UserMessage = memo(function UserMessage({ text, time }: { text: string; time: string }) {
    return (
        <div className='pointer-events-auto ml-6 flex flex-col items-end gap-0.5'>
            <div className='bg-background'>
                <div className='rounded-md bg-muted px-3 py-1.5 text-small'>
                    {withMentions(text)}
                </div>
            </div>
            {time && <p className='text-label text-muted-foreground'>{time}</p>}
        </div>
    );
});

interface SuggestionListProps {
    items: string[];
    onPick: (text: string) => void;
}

// SuggestionList is a quiet one-column list. A pick fills the message box.
const SuggestionList = memo(function SuggestionList({ items, onPick }: SuggestionListProps) {
    return (
        <div className='flex flex-col items-start gap-0.5'>
            {items.map(item => (
                <Button
                    key={item}
                    type='button'
                    size='micro'
                    variant='ghost'
                    className='max-w-full justify-start gap-2 text-muted-foreground'
                    onClick={() => onPick(item)}
                >
                    <CornerDownRight className='size-3 shrink-0' aria-hidden />
                    <span className='truncate'>{item}</span>
                </Button>
            ))}
        </div>
    );
});

// ToolTrail lists what the model looked up for a reply, so the user can see
// which parts of the schema were sent.
const ToolTrail = memo(function ToolTrail({ labels }: { labels: string[] }) {
    return (
        <ul
            aria-label='Looked up'
            className='flex flex-col gap-0.5 text-label text-muted-foreground'
        >
            {labels.map((label, index) => (
                <li key={`${index}-${label}`} className='flex items-center gap-1.5'>
                    <Search className='size-3 shrink-0' aria-hidden />
                    <span className='truncate'>{label}</span>
                </li>
            ))}
        </ul>
    );
});

interface TurnViewProps {
    turn: AISessionTurn;
    runLabel: string;
    onOpenSql: (sql: string, run: boolean) => void;
    suggestions: string[] | null;
    onPickSuggestion: (text: string) => void;
}

// TurnView is one saved message. A turn never changes after it is saved, so
// with stable props it does not render again while the user types or while a
// later reply streams in.
const TurnView = memo(function TurnView({
    turn,
    runLabel,
    onOpenSql,
    suggestions,
    onPickSuggestion,
}: TurnViewProps) {
    if (turn.role === 'user') {
        return <UserMessage text={turn.text} time={formatMessageTime(turn.createdAt)} />;
    }
    return (
        <div className='flex min-w-0 max-w-full flex-col gap-2.5'>
            <AssistantMarkdown
                text={visibleReplyText(turn.text)}
                onOpenSql={onOpenSql}
                runLabel={runLabel}
            />
            <p className='text-label text-muted-foreground'>
                {[
                    formatMessageTime(turn.createdAt),
                    formatDuration(turn.durationMs),
                    usageLine(turn.usage),
                ]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
            {turn.tools.length > 0 && <ToolTrail labels={turn.tools} />}
            {turn.rounds && turn.rounds.length > 0 && <AssistantSentRounds rounds={turn.rounds} />}
            {suggestions && <SuggestionList items={suggestions} onPick={onPickSuggestion} />}
        </div>
    );
});

// Exchange is one question and the replies that answer it.
interface Exchange {
    question: AISessionTurn | null;
    replies: AISessionTurn[];
}

function toExchanges(turns: AISessionTurn[]): Exchange[] {
    const out: Exchange[] = [];
    for (const turn of turns) {
        if (turn.role === 'user' || out.length === 0) {
            out.push({ question: turn.role === 'user' ? turn : null, replies: [] });
            if (turn.role === 'user') continue;
        }
        out[out.length - 1].replies.push(turn);
    }
    return out;
}

// ExchangeSection holds one question and its answer. The question sticks to
// the top of the chat while its answer scrolls past, the next question pushes
// it out, and scrolling back up lets it settle into its place again. The
// section carries the turn id the history rail scrolls to.
function ExchangeSection({
    id,
    question,
    children,
}: {
    id: string;
    question: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section data-user-turn={id} className='flex flex-col gap-4'>
            {/* The pinned strip is see-through and spans to the panel edge, so
                it lets the pointer through (to the scroll bar and the answer
                under it); only the question itself takes clicks. */}
            <div className='pointer-events-none sticky top-0 z-10 -mr-4 -ml-4 bg-transparent py-1.5 pr-4 pl-4'>
                {question}
            </div>
            {children}
        </section>
    );
}

// PINNED_DISTANCE is how close to the bottom still counts as following the
// reply. It is small, so a short scroll up stops the follow at once instead of
// being pulled back down while a reply streams.
const PINNED_DISTANCE = 24;

// useFollowBottom keeps the conversation scrolled to its newest message. It
// jumps to the bottom when a session opens or a message is added, and keeps
// following while the content grows (a streaming reply, code that colors in
// late) until the user scrolls up. Scrolling back near the bottom follows again.
function useFollowBottom(sessionId: string | undefined, turnCount: number, pendingKey: number) {
    const contentRef = useRef<HTMLDivElement>(null);
    const pinned = useRef(true);

    const viewport = () =>
        contentRef.current?.closest<HTMLElement>('[data-radix-scroll-area-viewport]') ?? null;
    const toBottom = () => {
        const el = viewport();
        if (el) el.scrollTop = el.scrollHeight;
    };

    useLayoutEffect(() => {
        pinned.current = true;
        toBottom();
    }, [sessionId, turnCount, pendingKey]);

    useEffect(() => {
        const el = viewport();
        const content = contentRef.current;
        if (!el || !content) return;
        const onScroll = () => {
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < PINNED_DISTANCE;
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        const observer =
            typeof ResizeObserver === 'undefined'
                ? null
                : new ResizeObserver(() => {
                      if (pinned.current) toBottom();
                  });
        observer?.observe(content);
        return () => {
            el.removeEventListener('scroll', onScroll);
            observer?.disconnect();
        };
    }, []);

    return contentRef;
}

interface AssistantMessagesProps {
    // hint explains why the chat cannot be used yet. It replaces the empty state.
    hint: string | null;
    runLabel: string;
    onOpenSql: (sql: string, run: boolean) => void;
    onPickSuggestion: (text: string) => void;
}

// AssistantMessages is the scrolling conversation. It reads the chat store by
// field and takes only stable props, so it stays out of the way of the message
// box: typing there does not render this list.
export const AssistantMessages = memo(function AssistantMessages({
    hint,
    runLabel,
    onOpenSql,
    onPickSuggestion,
}: AssistantMessagesProps) {
    const turns = useAIChatStore(state => state.session?.turns) ?? NO_TURNS;
    const sessionId = useAIChatStore(state => state.session?.id);
    const pending = useAIChatStore(state => state.pending);
    const notice = useAIChatStore(state => state.notice);
    const chatError = useAIChatStore(state => state.error);
    const chatBusy = useAIChatStore(state => state.busy);
    const firstTable = useAIChatStore(state => state.mentions?.tables[0]?.name);
    const sessions = useAIChatStore(state => state.sessions);
    const openSession = useAIChatStore(state => state.openSession);
    const storeError = useAISettingsStore(state => state.error);
    const storeBusy = useAISettingsStore(state => state.busy);

    const contentRef = useFollowBottom(sessionId, turns.length, pending?.startedAt ?? 0);

    const busy = chatBusy || storeBusy;
    const error = chatError || storeError;

    const lastAssistant = useMemo(
        () => [...turns].reverse().find(turn => turn.role === 'assistant'),
        [turns],
    );

    const exchanges = useMemo(() => toExchanges(turns), [turns]);

    const earlierChats = useMemo(() => recentChats(sessions, sessionId), [sessions, sessionId]);

    const starters = useMemo(
        () => [
            ...(firstTable
                ? [`What is @${firstTable} used for?`, `Which tables reference @${firstTable}?`]
                : []),
            'Find tables without a primary key',
        ],
        [firstTable],
    );

    return (
        // Radix wraps the content in a display:table box that grows with its
        // widest child, so one long SQL line widened the whole chat and pushed
        // the code actions out of view. Making that box a block keeps every
        // message inside the panel; wide code scrolls inside its own block.
        <div className='relative flex min-h-0 flex-1 flex-col'>
            <ScrollArea className='min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block'>
                <div ref={contentRef} className='flex w-full min-w-0 max-w-full flex-col gap-4 p-4'>
                    {hint && <p className='text-label text-muted-foreground'>{hint}</p>}
                    {!hint && turns.length === 0 && !pending && (
                        <>
                            <div className='flex flex-col gap-1'>
                                <p className='font-medium'>Ask about this Project</p>
                                <p className='text-muted-foreground'>
                                    The assistant sees structure only: tables, columns, keys. Never
                                    rows, unless you turn on Data mode. Type @ to point at a table,
                                    schema or column.
                                </p>
                            </div>
                            <SuggestionList items={starters} onPick={onPickSuggestion} />
                            <AssistantRecentChats
                                sessions={earlierChats}
                                onOpen={id => void openSession(id)}
                            />
                        </>
                    )}
                    {exchanges.map((exchange, index) => (
                        <ExchangeView
                            key={exchange.question?.id ?? `lead-${index}`}
                            exchange={exchange}
                            lastAssistant={lastAssistant}
                            busy={busy}
                            runLabel={runLabel}
                            onOpenSql={onOpenSql}
                            onPickSuggestion={onPickSuggestion}
                        />
                    ))}
                    {pending && (
                        <ExchangeSection
                            id={PENDING_TURN_ID}
                            question={
                                <UserMessage
                                    text={pending.question}
                                    time={formatMessageTime(
                                        new Date(pending.startedAt).toISOString(),
                                    )}
                                />
                            }
                        >
                            {pending.tools.length > 0 && (
                                <ToolTrail
                                    labels={pending.tools.map(tool =>
                                        tool.withheld ? `${tool.label} (withheld)` : tool.label,
                                    )}
                                />
                            )}
                            <AssistantElapsed startedAt={pending.startedAt} />
                            {pending.rounds.length > 0 && (
                                <AssistantSentRounds rounds={pending.rounds} />
                            )}
                            {visibleReplyText(pending.text) ? (
                                <AssistantMarkdown
                                    text={visibleReplyText(pending.text)}
                                    onOpenSql={onOpenSql}
                                    runLabel={runLabel}
                                />
                            ) : (
                                <div
                                    role='status'
                                    aria-label='Waiting for the reply'
                                    className='flex flex-col gap-2 pt-0.5'
                                >
                                    <div className='ai-shimmer h-2.5 w-3/4' />
                                    <div className='ai-shimmer h-2.5 w-1/2' />
                                </div>
                            )}
                        </ExchangeSection>
                    )}
                    {notice && <p className='text-label text-muted-foreground'>{notice}</p>}
                    {error && <p className='text-label text-destructive'>{error}</p>}
                </div>
            </ScrollArea>
        </div>
    );
});
