// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';
import { visibleReplyText } from './aiAssistant';

describe('visibleReplyText', () => {
    it('leaves a normal reply alone', () => {
        expect(visibleReplyText('SELECT a < b FROM t')).toBe('SELECT a < b FROM t');
    });

    it('cuts the suggestions tag and everything after it', () => {
        expect(visibleReplyText('Answer.\n<suggestions>["a"]</suggestions>')).toBe('Answer.');
        expect(visibleReplyText('Answer.\n<suggestions>["a", "b')).toBe('Answer.');
    });

    it('cuts tool-call markup written with full-width or plain bars', () => {
        expect(visibleReplyText('Answer.\n<｜DSML｜function_calls>\n<｜DSML｜invoke')).toBe(
            'Answer.',
        );
        expect(visibleReplyText('Answer.\n< | DSML | function_calls>')).toBe('Answer.');
    });

    it('does not flash a half-written opener while it streams', () => {
        expect(visibleReplyText('Answer.\n<sugg')).toBe('Answer.');
        expect(visibleReplyText('Answer.\n<｜')).toBe('Answer.');
        expect(visibleReplyText('Answer.\n<')).toBe('Answer.');
    });
});
