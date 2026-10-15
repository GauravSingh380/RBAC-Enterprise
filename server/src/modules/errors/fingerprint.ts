// Grouping production errors: the same bug must land in the same group even though every
// occurrence has a different id, number, timestamp, line number or bundle hash.
//
//   fingerprint = sha1( source | error type | normalized message | top stack frame | route )
//
// Pure functions (no database) → unit-tested in tests/unit/fingerprint.test.ts.
import crypto from 'node:crypto';

/** Replace the parts of a message that change between occurrences with placeholders. */
export function normalizeMessage(message: string): string {
  return message
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
    .replace(/"[^"]{0,200}"/g, '"<str>"')
    .replace(/'[^']{0,200}'/g, "'<str>'")
    .replace(/\b\d+(\.\d+)?\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/**
 * First stack frame that is OUR code (not node_modules / node internals), without line numbers
 * or machine-specific path prefixes: "modules/projects/projects.service.ts in ProjectsService.create".
 */
export function serverTopFrame(stack: string | undefined): string | null {
  if (!stack) return null;
  for (const line of stack.split('\n').slice(1)) {
    const m = /at (?:(.+?) \()?(.+?):\d+:\d+\)?\s*$/.exec(line.trim());
    if (!m) continue;
    const file = m[2]!.replace(/\\/g, '/');
    if (file.includes('node_modules') || file.startsWith('node:') || !file.includes('/src/')) continue;
    const relative = file.slice(file.lastIndexOf('/src/') + 5);
    return m[1] ? `${relative} in ${m[1]}` : relative;
  }
  return null;
}

/**
 * Browser stacks: first frame of the app bundle. Strips origin, query strings, line/column and the
 * content hash Vite puts in file names (BoardPage-AbC123de.js → BoardPage.js) so a new deploy
 * doesn't create a new group for the same bug.
 */
export function clientTopFrame(stack: string | undefined): string | null {
  if (!stack) return null;
  for (const line of stack.split('\n')) {
    // Chrome: "at fn (https://host/assets/x.js:1:2)"  Firefox/Safari: "fn@https://host/assets/x.js:1:2"
    const m = /(?:at (?:(.+?) \()?|^(.*?)@)(https?:\/\/[^)\s]+?|\/[^)\s]+?):\d+:\d+\)?\s*$/.exec(line.trim());
    if (!m) continue;
    const fn = (m[1] ?? m[2] ?? '').trim();
    let file = m[3]!.replace(/^https?:\/\/[^/]+/, '').split('?')[0]!.split('#')[0]!;
    if (file.includes('node_modules') || file.includes('/@vite/') || file.includes('/vendor-')) continue;
    file = file.replace(/-[A-Za-z0-9_-]{8}(\.m?js)$/, '$1');
    return fn ? `${file} in ${fn}` : file;
  }
  return null;
}

/**
 * The route PATTERN of a request, so "/api/projects/TF/items/12" and "/api/projects/WEB/items/9" group together.
 * Express has already left the routers when the error handler runs (req.baseUrl is reset), so the prefix is
 * rebuilt from the URL: the last segments are the matched route path, ids / keys in the prefix become placeholders.
 */
export function routePattern(path: string, matchedRoute: string | undefined): string {
  const segments = path.split('?')[0]!.split('/').filter(Boolean);
  const routeSegments = (matchedRoute ?? '').split('/').filter(Boolean);
  const prefix = (matchedRoute === undefined ? segments : segments.slice(0, segments.length - routeSegments.length)).map((s, i, all) =>
    all[i - 1] === 'projects' ? ':projectRef'
    : /^[A-Za-z][A-Za-z0-9]{1,9}-\d+$/.test(s) ? ':itemRef'
    : /^\d+$/.test(s) ? ':id'
    : s,
  );
  return '/' + [...prefix, ...(matchedRoute === undefined ? [] : routeSegments)].join('/');
}

export function fingerprint(parts: (string | null | undefined)[]): string {
  return crypto.createHash('sha1').update(parts.map((p) => p ?? '').join('|')).digest('hex');
}

/** Very small user-agent parser: enough to pre-fill "Browser" and "OS" on a bug. */
export function parseUserAgent(ua: string | null | undefined): { browser: string | null; os: string | null } {
  if (!ua) return { browser: null, os: null };
  // order matters: Edge and Opera also say "Chrome", Chrome also says "Safari"
  const browsers: [string, RegExp][] = [
    ['Edge', /Edg\/(\d+)/],
    ['Opera', /OPR\/(\d+)/],
    ['Firefox', /Firefox\/(\d+)/],
    ['Chrome', /Chrome\/(\d+)/],
    ['Safari', /Version\/(\d+).*Safari/],
  ];
  let browser: string | null = null;
  for (const [name, re] of browsers) {
    const m = re.exec(ua);
    if (m) {
      browser = `${name} ${m[1]}`;
      break;
    }
  }
  const os =
    /Windows NT 10/.test(ua) ? 'Windows 10/11'
    : /Windows NT/.test(ua) ? 'Windows'
    : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android'
    : /Linux/.test(ua) ? 'Linux'
    : null;
  return { browser, os };
}
