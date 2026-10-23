// SPDX-License-Identifier: GPL-3.0-only

// relativeTime shortens a timestamp for the chat history list: now, 12m, 4h, 2d, 3w.
export function relativeTime(iso: string, now: number = Date.now()): string {
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return '';
    const minutes = Math.max(0, Math.floor((now - then) / 60000));
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return `${Math.floor(days / 7)}w`;
}

const pad = (value: number) => String(value).padStart(2, '0');

// formatMessageTime labels one chat message: HH:mm today, dd/MM HH:mm before.
export function formatMessageTime(iso: string, now: number = Date.now()): string {
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return '';
    const today = new Date(now);
    const clock = `${pad(then.getHours())}:${pad(then.getMinutes())}`;
    const sameDay =
        then.getFullYear() === today.getFullYear() &&
        then.getMonth() === today.getMonth() &&
        then.getDate() === today.getDate();
    return sameDay ? clock : `${pad(then.getDate())}/${pad(then.getMonth() + 1)} ${clock}`;
}

// formatDuration labels how long a reply took: seconds under a minute,
// otherwise whole minutes, rounded up (75 s reads "2 min").
export function formatDuration(ms: number | undefined | null): string {
    if (!ms || ms <= 0) return '';
    if (ms < 60000) return `${Math.max(1, Math.ceil(ms / 1000))}s`;
    return `${Math.ceil(ms / 60000)} min`;
}
