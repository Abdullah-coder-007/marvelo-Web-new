import { expect, test } from 'vitest';
import { normalizeUrl, assertPublicHost } from '../src/url-guard.js';

test('normalises messy input', () => {
  expect(normalizeUrl('  WWW.Rivera-Plumbing.com/ ').href).toBe('https://www.rivera-plumbing.com/');
  expect(normalizeUrl('rivera-plumbing.com').href).toBe('https://rivera-plumbing.com/');
});
test.each(['file:///etc/passwd', 'ftp://a.com', 'javascript:alert(1)'])('refuses scheme %s', (u) =>
  expect(() => normalizeUrl(u)).toThrow(expect.objectContaining({ code: 'scheme' })));
test('refuses non-standard port', () => expect(() => normalizeUrl('https://a.com:8080')).toThrow(expect.objectContaining({ code: 'port' })));
test.each(['localhost', '10.0.0.1', '127.0.0.1', '169.254.169.254', '192.168.1.1', '[::1]'])('refuses %s', async (h) => {
  await expect(assertPublicHost(new URL(`http://${h}/`), async () => [])).rejects.toMatchObject({ code: 'private' });
});
test('refuses a public name that resolves to a private IP', async () => {
  await expect(assertPublicHost(new URL('https://evil.example/'), async () => ['10.1.2.3'])).rejects.toMatchObject({ code: 'private' });
});
test('accepts a public site', async () => {
  await expect(assertPublicHost(new URL('https://example.com/'), async () => ['93.184.215.14'])).resolves.toBeUndefined();
});
test('refuses garbage input as invalid', () => {
  expect(() => normalizeUrl('')).toThrow(expect.objectContaining({ code: 'invalid' }));
  expect(() => normalizeUrl('http://')).toThrow(expect.objectContaining({ code: 'invalid' }));
});
test('refuses .local names and other private ranges', async () => {
  for (const h of ['printer.local', '100.64.0.1', '172.16.5.5', '0.0.0.0', '[fc00::1]', '[fe80::1]', '[::ffff:10.0.0.1]']) {
    await expect(assertPublicHost(new URL(`http://${h}/`), async () => [])).rejects.toMatchObject({ code: 'private' });
  }
});
test('allows 172.32 and 100.128 (outside private ranges)', async () => {
  await expect(assertPublicHost(new URL('http://172.32.0.1/'), async () => [])).resolves.toBeUndefined();
  await expect(assertPublicHost(new URL('http://100.128.0.1/'), async () => [])).resolves.toBeUndefined();
});
test('default resolver uses DNS-over-HTTPS for A and AAAA', async () => {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (u, init) => {
    calls.push([String(u), init.headers.accept]);
    const type = new URL(u).searchParams.get('type');
    return Response.json({ Answer: type === 'A' ? [{ type: 1, data: '8.8.8.8' }] : [{ type: 28, data: 'fd00::1' }] });
  };
  try {
    await expect(assertPublicHost(new URL('https://example.com/'))).rejects.toMatchObject({ code: 'private' });
  } finally { globalThis.fetch = orig; }
  expect(calls.map((c) => c[0]).sort()).toEqual([
    'https://cloudflare-dns.com/dns-query?name=example.com&type=A',
    'https://cloudflare-dns.com/dns-query?name=example.com&type=AAAA',
  ]);
  expect(calls[0][1]).toBe('application/dns-json');
});
