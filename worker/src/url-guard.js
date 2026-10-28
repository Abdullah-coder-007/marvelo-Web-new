export class GuardError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'GuardError';
    this.code = code; // 'invalid' | 'scheme' | 'port' | 'private'
  }
}

export function normalizeUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new GuardError('invalid');
  // A scheme is "letters:" not followed by a port-like "digits" (so host:8080 still gets https://).
  const hasScheme = /^[a-z][a-z0-9+.-]*:(?!\d+(\/|$))/i.test(raw);
  let url;
  try {
    url = new URL(hasScheme ? raw : `https://${raw}`);
  } catch {
    throw new GuardError('invalid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new GuardError('scheme');
  if (!url.hostname) throw new GuardError('invalid');
  if (url.port && url.port !== '80' && url.port !== '443') throw new GuardError('port');
  return url;
}

function isPrivateV4(ip) {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateV6(ip) {
  const h = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h.includes(':')) return false;
  if (h === '::1' || h === '::') return true;
  // IPv4-mapped (::ffff:a.b.c.d, or the hex form the URL parser produces)
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (dotted) return isPrivateV4(dotted[1]);
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return isPrivateV4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const first = parseInt(h.split(':')[0] || '0', 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80; // fc00::/7, fe80::/10
}

const isPrivateIp = (ip) => isPrivateV4(ip) || isPrivateV6(ip);

async function dohResolve(name, type) {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    { headers: { accept: 'application/dns-json' } },
  );
  if (!res.ok) throw new GuardError('invalid', `dns lookup failed (${res.status})`);
  const body = await res.json();
  const want = type === 'A' ? 1 : 28;
  return (body.Answer || []).filter((a) => a.type === want).map((a) => a.data);
}

export async function assertPublicHost(url, resolve = dohResolve) {
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new GuardError('private');
  }
  if (isPrivateIp(host)) throw new GuardError('private');
  // Literal IPs need no lookup.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) return;
  const [a, aaaa] = await Promise.all([resolve(host, 'A'), resolve(host, 'AAAA')]);
  if ([...a, ...aaaa].some(isPrivateIp)) throw new GuardError('private');
}
