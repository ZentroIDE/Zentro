// Path matching for public-export.json. Patterns use * (inside one path
// segment), ** (any depth) and a trailing / for a directory and everything
// below it. Paths use forward slashes.
const REGEXP_SPECIALS = /[.+?^${}()|[\]\\]/g;

export function globToRegExp(pattern) {
    const dir = pattern.endsWith('/');
    const body = dir ? pattern.slice(0, -1) : pattern;
    let re = '';
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (c === '*' && body[i + 1] === '*') {
            const slash = body[i + 2] === '/';
            re += slash ? '(?:.*/)?' : '.*';
            i += slash ? 2 : 1;
        } else if (c === '*') {
            re += '[^/]*';
        } else {
            re += c.replace(REGEXP_SPECIALS, '\\$&');
        }
    }
    return new RegExp(dir ? `^${re}(?:/.*)?$` : `^${re}$`);
}

export function matcher(patterns) {
    const regexps = patterns.map(globToRegExp);
    return path => regexps.some(re => re.test(path));
}
