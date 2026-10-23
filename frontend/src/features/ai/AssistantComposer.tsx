// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Square } from 'lucide-react';
import type { AIUsage } from '../../lib/aiAssistant';
import { formatTokenCount } from '../../lib/aiTokens';
import {
    Button,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Textarea,
} from '../../components/ui';

interface AssistantTokenBarProps {
    total: AIUsage;
    // left holds the controls that belong to the chat as a whole, such as the
    // list of questions; the token count stays on the right.
    left?: React.ReactNode;
}

// AssistantTokenBar sits above the composer. It shows what this chat has used,
// from the provider's own counts, on the right, and the chat's own controls on
// the left. Nothing shows before a reply, unless there are controls.
export function AssistantTokenBar({ total, left }: AssistantTokenBarProps) {
    const used = total.input + total.output;
    if (used === 0 && !left) return null;
    const detail = `in ${formatTokenCount(total.input)} · out ${formatTokenCount(total.output)}${
        total.cached > 0 ? ` · cached ${formatTokenCount(total.cached)}` : ''
    }`;
    return (
        <div className='flex items-center justify-between gap-2 px-0.5 text-label text-muted-foreground'>
            <span className='flex min-w-0 items-center'>{left}</span>
            <span title={detail}>
                {formatTokenCount(used)} tokens
                {/* The share of input the provider billed at its cached rate: the
                    payoff of keeping each request's start the same. */}
                {total.cached > 0 && total.input > 0
                    ? ` · ${Math.round((total.cached / total.input) * 100)}% cached`
                    : ''}
            </span>
        </div>
    );
}

export interface ComposerModel {
    value: string;
    choices: string[];
    disabled: boolean;
    onChange: (value: string) => void;
}

interface AssistantComposerProps {
    textareaRef: React.RefObject<HTMLTextAreaElement>;
    message: string;
    placeholder: string;
    disabled: boolean;
    busy: boolean;
    activeDescendant?: string;
    popup?: React.ReactNode;
    notice?: React.ReactNode;
    onChange: (value: string, caret: number) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    model: ComposerModel | null;
    setup?: React.ReactNode;
    pending: boolean;
    sendDisabled: boolean;
    // waiting is set while a notice above the box waits for an answer (review,
    // new host, or sensitive text). Send turns into Cancel, which drops it.
    waiting: boolean;
    onSend: () => void;
    onStop: () => void;
    onCancel: () => void;
}

// AssistantComposer is the message box. A notice, when there is one, is stacked
// on top of it. Then the text area. Underneath, on
// the left, the setup popover and the model picker. On the right, Send, or
// Stop while a reply is on its way.
export function AssistantComposer({
    textareaRef,
    message,
    placeholder,
    disabled,
    busy,
    activeDescendant,
    popup,
    notice,
    onChange,
    onKeyDown,
    model,
    setup,
    pending,
    sendDisabled,
    waiting,
    onSend,
    onStop,
    onCancel,
}: AssistantComposerProps) {
    return (
        <div className='relative flex flex-col rounded-md border border-border bg-background'>
            {popup && <div className='absolute bottom-full left-0 right-0 mb-1.5'>{popup}</div>}
            {notice}
            <Textarea
                ref={textareaRef}
                value={message}
                placeholder={placeholder}
                aria-label='Assistant message'
                aria-activedescendant={activeDescendant}
                disabled={disabled}
                className='min-h-14 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0'
                onChange={event => {
                    onChange(
                        event.target.value,
                        event.target.selectionStart ?? event.target.value.length,
                    );
                }}
                onKeyDown={onKeyDown}
            />
            <div className='flex items-center gap-1 px-1.5 pb-1.5'>
                {setup}
                {model && model.choices.length > 0 && (
                    <Select
                        value={model.value}
                        disabled={model.disabled}
                        onValueChange={model.onChange}
                    >
                        <SelectTrigger
                            aria-label='Chat model'
                            className='h-6 w-auto max-w-50 gap-1 border-0 bg-transparent px-1.5 text-label text-muted-foreground shadow-none'
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {model.choices.map(id => (
                                <SelectItem key={id} value={id}>
                                    {id}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                <span className='flex-1' />
                {pending ? (
                    <Button type='button' variant='outline' onClick={onStop}>
                        <Square className='size-2.5 fill-current' aria-hidden />
                        Stop
                    </Button>
                ) : waiting ? (
                    <Button type='button' variant='outline' disabled={busy} onClick={onCancel}>
                        Cancel
                    </Button>
                ) : (
                    <Button type='button' disabled={sendDisabled || busy} onClick={onSend}>
                        Send
                    </Button>
                )}
            </div>
        </div>
    );
}
