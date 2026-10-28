import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { cleanPreviewHtml } from '../src/preview.js';

beforeEach(async () => {
  const { keys } = await env.MW.list();
  await Promise.all(keys.map((k) => env.MW.delete(k.name)));
});
afterEach(() => vi.restoreAllMocks());

test('cleans fenced output and scripts', () => {
  const out = cleanPreviewHtml('```html\n<html><body>Hi<script>alert(1)</script></body></html>\n```');
  expect(out).toBe('<html><body>Hi</body></html>');
});
test('removes multiple and attribute-bearing scripts, case-insensitively', () => {
  const out = cleanPreviewHtml('<html><SCRIPT src="x">a</SCRIPT><p>k</p><script>\nb\n</script></html>');
  expect(out).toBe('<html><p>k</p></html>');
});
test('throws when there is no html', () => {
  expect(() => cleanPreviewHtml('Sorry, I cannot')).toThrow();
});

const KEY = 'k'.repeat(32);
async function seed() {
  await env.MW.put('lead:abc', JSON.stringify({ id: 'abc', previewKey: KEY }));
  await env.MW.put('preview:abc', '<html><body>Hello</body></html>');
}

test('preview route: right key 200 with noindex + CSP, wrong key 404', async () => {
  await seed();
  const ok = await SELF.fetch(`https://api.test/p/abc?k=${KEY}`);
  expect(ok.status).toBe(200);
  expect(await ok.text()).toContain('Hello');
  expect(ok.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  expect(ok.headers.get('content-security-policy')).toBe("default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https:");
  expect(ok.headers.get('cache-control')).toBe('private');
  expect(ok.headers.get('content-type')).toContain('text/html');
  expect((await SELF.fetch(`https://api.test/p/abc?k=${'z'.repeat(32)}`)).status).toBe(404);
  expect((await SELF.fetch('https://api.test/p/abc')).status).toBe(404);
  expect((await SELF.fetch(`https://api.test/p/nope?k=${KEY}`)).status).toBe(404);
});
