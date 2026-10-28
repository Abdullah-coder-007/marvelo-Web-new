import { test, expect } from 'vitest';
import { scanHtml, fetchPage } from '../src/page-scan.js';
import good from './fixtures/good.html?raw';
import old from './fixtures/old.html?raw';
import bare from './fixtures/bare.html?raw';

const fixtures = { 'good.html': good, 'old.html': old, 'bare.html': bare };
const fixture = (n) => fixtures[n];
function htmlResponse(body, url) {
  const res = new Response(body, { headers: { 'content-type': 'text/html' } });
  Object.defineProperty(res, 'url', { value: url });
  return res;
}
const PUB = async () => ['93.184.215.14'];

test('good page facts', async () => {
  const f = await scanHtml(htmlResponse(fixture('good.html'), 'https://good.example/'));
  expect(f).toMatchObject({ title: 'Rivera Plumbing | Austin plumbers', viewport: true, https: true, indexable: true, h1Count: 1, actionButton: true });
  expect(f.telLinks).toBeGreaterThan(0);
  expect(f.jsonLdTypes).toContain('LocalBusiness');
  expect(f.forms).toBe(1);
  expect(f.copyrightYear).toBe(2025);
  expect(f.phone).toBe('+15125550142');
  expect(f.address).toContain('12 Congress Ave');
  expect(f.headings).toContain('Services');
  expect(f.text).toContain('Leak repair');
  expect(f.text).not.toContain('font-family');
  expect(f.text).not.toContain('@context');
});
test('old page facts', async () => {
  const f = await scanHtml(htmlResponse(fixture('old.html'), 'http://old.example/'));
  expect(f).toMatchObject({ viewport: false, https: false, telLinks: 0, copyrightYear: 2014, h1Count: 2 });
});
test('bare page has no title or description', async () => {
  const f = await scanHtml(htmlResponse(fixture('bare.html'), 'https://bare.example/'));
  expect(f.title).toBe(''); expect(f.description).toBe('');
});
test('noindex is not indexable', async () => {
  const f = await scanHtml(htmlResponse('<meta name="robots" content="noindex,follow"><p>x</p>', 'https://x.example/'));
  expect(f.indexable).toBe(false);
});
test('text is capped at 4000 chars', async () => {
  const f = await scanHtml(htmlResponse(`<body><p>${'a'.repeat(9000)}</p></body>`, 'https://x.example/'));
  expect(f.text.length).toBe(4000);
});
test('fetchPage returns facts for a good page, following a relative redirect', async () => {
  let n = 0;
  const fetch = async (u) => (n++ === 0
    ? new Response(null, { status: 301, headers: { location: '/home' } })
    : htmlResponse(fixture('good.html'), u));
  const r = await fetchPage(new URL('https://good.example/'), { fetch, resolve: PUB });
  expect(r.error).toBeNull();
  expect(r.facts.title).toBe('Rivera Plumbing | Austin plumbers');
  expect(r.facts.https).toBe(true);
});
test('refuses a redirect to a private address', async () => {
  const fetch = async () => new Response(null, { status: 302, headers: { location: 'http://10.0.0.5/' } });
  const r = await fetchPage(new URL('https://pub.example/'), { fetch, resolve: async (n) => n === 'pub.example' ? ['93.184.215.14'] : [] });
  expect(r).toEqual({ facts: null, error: 'private' });
});
test('refuses a first URL that resolves to a private address', async () => {
  const fetch = async () => { throw new Error('should not fetch'); };
  const r = await fetchPage(new URL('https://evil.example/'), { fetch, resolve: async () => ['127.0.0.1'] });
  expect(r).toEqual({ facts: null, error: 'private' });
});
test('refuses a redirect to a non-http scheme', async () => {
  const fetch = async () => new Response(null, { status: 302, headers: { location: 'ftp://pub.example/' } });
  expect(await fetchPage(new URL('https://pub.example/'), { fetch, resolve: PUB })).toEqual({ facts: null, error: 'scheme' });
});
test('stops after too many redirects', async () => {
  const fetch = async () => new Response(null, { status: 302, headers: { location: '/again' } });
  expect(await fetchPage(new URL('https://loop.example/'), { fetch, resolve: PUB })).toEqual({ facts: null, error: 'redirects' });
});
test('stops at 2 MB and rejects non-HTML', async () => {
  const pdf = async () => new Response(new Uint8Array(3_000_000), { headers: { 'content-type': 'application/pdf' } });
  expect(await fetchPage(new URL('https://pdf.example/'), { fetch: pdf, resolve: async () => ['93.184.215.14'] })).toEqual({ facts: null, error: 'not-html' });
});
test('maps timeouts and other failures', async () => {
  const slow = async () => { throw new DOMException('t', 'TimeoutError'); };
  expect(await fetchPage(new URL('https://a.example/'), { fetch: slow, resolve: PUB })).toEqual({ facts: null, error: 'timeout' });
  const boom = async () => { throw new TypeError('network'); };
  expect(await fetchPage(new URL('https://a.example/'), { fetch: boom, resolve: PUB })).toEqual({ facts: null, error: 'fetch-failed' });
});
