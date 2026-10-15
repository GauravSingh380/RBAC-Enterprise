import { describe, expect, it } from 'vitest';
import { clientTopFrame, fingerprint, normalizeMessage, parseUserAgent, routePattern, serverTopFrame } from '../../src/modules/errors/fingerprint.js';

describe('error fingerprinting', () => {
  it('normalizes the parts of a message that change per occurrence', () => {
    expect(normalizeMessage('User 42 not found in org 7')).toBe('User <n> not found in org <n>');
    expect(normalizeMessage('duplicate key "TF" (id 9f1c2b3a-1111-4222-8333-444455556666)')).toBe('duplicate key "<str>" (id <uuid>)');
    expect(normalizeMessage("relation 'foo'   does not\nexist")).toBe("relation '<str>' does not exist");
    expect(normalizeMessage('x'.repeat(500))).toHaveLength(300);
  });

  it('takes the first frame of OUR server code, without line numbers or machine paths', () => {
    const stack = [
      'Error: boom',
      '    at Object.query (C:\\app\\node_modules\\pg\\lib\\client.js:526:17)',
      '    at ProjectsService.create (C:\\Users\\me\\Team-Flex\\server\\src\\modules\\projects\\projects.service.ts:120:11)',
      '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
    ].join('\n');
    expect(serverTopFrame(stack)).toBe('modules/projects/projects.service.ts in ProjectsService.create');
    expect(serverTopFrame(stack.replace(':120:11', ':999:1'))).toBe(serverTopFrame(stack)); // a moved line keeps the group
    expect(serverTopFrame(undefined)).toBeNull();
  });

  it('strips bundle hashes and origins from browser frames (new deploy → same group)', () => {
    const chrome = 'TypeError: x\n    at onDrop (https://app.example.com/assets/BoardPage-AbC123de.js:1:2345)';
    const firefox = 'onDrop@http://localhost:5173/assets/BoardPage-Zz9_8xYw.js:1:99';
    expect(clientTopFrame(chrome)).toBe('/assets/BoardPage.js in onDrop');
    expect(clientTopFrame(firefox)).toBe('/assets/BoardPage.js in onDrop');
    expect(clientTopFrame('at x (https://a.com/assets/vendor-react-AAAAAAAA.js:1:1)\n at y (https://a.com/src/pages/X.tsx?t=1:3:4)')).toBe('/src/pages/X.tsx in y');
  });

  it('turns URLs into route patterns (ids, keys and projects become placeholders)', () => {
    expect(routePattern('/api/errors/simulate/generic', '/simulate/:kind')).toBe('/api/errors/simulate/:kind');
    expect(routePattern('/api/projects/WEB/items?page=2', '/')).toBe('/api/projects/:projectRef/items');
    expect(routePattern('/api/work-items/TF-12/comments/7', '/:itemRef/comments/:commentId')).toBe('/api/work-items/:itemRef/comments/:commentId');
    expect(routePattern('/api/unknown/42', undefined)).toBe('/api/unknown/:id');
  });

  it('builds stable fingerprints', () => {
    expect(fingerprint(['server', 'Error', 'a'])).toHaveLength(40);
    expect(fingerprint(['server', 'Error', 'a'])).toBe(fingerprint(['server', 'Error', 'a']));
    expect(fingerprint(['server', 'Error', 'a'])).not.toBe(fingerprint(['client', 'Error', 'a']));
  });

  it('reads browser and OS from a user agent', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
    const edge = `${chrome} Edg/128.0.0.0`;
    const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
    expect(parseUserAgent(chrome)).toEqual({ browser: 'Chrome 128', os: 'Windows 10/11' });
    expect(parseUserAgent(edge).browser).toBe('Edge 128');
    expect(parseUserAgent(safari)).toEqual({ browser: 'Safari 17', os: 'macOS' });
    expect(parseUserAgent(null)).toEqual({ browser: null, os: null });
  });
});
