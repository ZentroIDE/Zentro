// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { domEventBus } from './eventBus';

describe('domEventBus', () => {
    let eventCounter = 0;

    function nextEvent(base: string): string {
        eventCounter += 1;
        return `${base}:${eventCounter}`;
    }

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    describe('emit + on', () => {
        it('emits and receives a payload via DOM CustomEvent', () => {
            const evt = nextEvent('test:event');
            const handler = vi.fn();
            const unsub = domEventBus.on(evt, handler);

            domEventBus.emit(evt, { foo: 'bar' });

            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith({ foo: 'bar' });

            unsub();
        });

        it('handles payload of different types', () => {
            const evt = nextEvent('test:number');
            const handler = vi.fn();
            domEventBus.on(evt, handler);

            domEventBus.emit(evt, 42);
            expect(handler).toHaveBeenCalledWith(42);

            domEventBus.emit(evt, 'string');
            expect(handler).toHaveBeenCalledWith('string');

            domEventBus.emit(evt, undefined);
            expect(handler).toHaveBeenCalledWith(null);
        });

        it('does not call handler after unsubscribe', () => {
            const evt = nextEvent('test:cleanup');
            const handler = vi.fn();
            const unsub = domEventBus.on(evt, handler);

            domEventBus.emit(evt, 'first');
            expect(handler).toHaveBeenCalledTimes(1);

            unsub();

            domEventBus.emit(evt, 'second');
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('off', () => {
        it('removes a specific handler', () => {
            const evt = nextEvent('test:off');
            const handler = vi.fn();
            const handler2 = vi.fn();

            domEventBus.on(evt, handler);
            domEventBus.on(evt, handler2);

            domEventBus.emit(evt, 'data');
            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler2).toHaveBeenCalledTimes(1);

            domEventBus.off(evt, handler);

            domEventBus.emit(evt, 'data2');
            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler2).toHaveBeenCalledTimes(2);
        });

        it('does nothing when handler is undefined', () => {
            const evt = nextEvent('test:off-all');
            const handler = vi.fn();
            domEventBus.on(evt, handler);

            domEventBus.off(evt);

            domEventBus.emit(evt, 'data');
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('multiple listeners', () => {
        it('supports multiple handlers for same event', () => {
            const evt = nextEvent('test:multi');
            const handler1 = vi.fn();
            const handler2 = vi.fn();

            domEventBus.on(evt, handler1);
            domEventBus.on(evt, handler2);

            domEventBus.emit(evt, 'payload');

            expect(handler1).toHaveBeenCalledWith('payload');
            expect(handler2).toHaveBeenCalledWith('payload');
        });
    });

    describe('events do not leak between names', () => {
        it('only fires handlers for the emitted event', () => {
            const evtA = nextEvent('event:a');
            const evtB = nextEvent('event:b');
            const handlerA = vi.fn();
            const handlerB = vi.fn();

            domEventBus.on(evtA, handlerA);
            domEventBus.on(evtB, handlerB);

            domEventBus.emit(evtA, 'only A');

            expect(handlerA).toHaveBeenCalledTimes(1);
            expect(handlerB).not.toHaveBeenCalled();
        });
    });
});
