import { describe, expect, it } from 'vitest';
import { assertPublicHttpUrl } from '@ove/api';

// The server fetches URLs itself (brand scraping), so a request must name a public internet host —
// checked as a resolved address, not just as text, because `http://2130706433` and `http://[::1]`
// are loopback in disguise.
describe('assertPublicHttpUrl', () => {
  it('accepts plain public http(s) URLs', async () => {
    await expect(assertPublicHttpUrl('https://linear.app')).resolves.toBeInstanceOf(URL);
    await expect(assertPublicHttpUrl('http://example.com/pricing')).resolves.toBeInstanceOf(URL);
  });

  it('requires http or https and standard ports', async () => {
    await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow(/http and https/);
    await expect(assertPublicHttpUrl('ftp://example.com')).rejects.toThrow(/http and https/);
    await expect(assertPublicHttpUrl('http://example.com:8080/')).rejects.toThrow(/ports 80 and 443/);
    await expect(assertPublicHttpUrl('http://user:pass@example.com/')).rejects.toThrow(/credentials/);
    await expect(assertPublicHttpUrl('not a url')).rejects.toThrow(/not a valid URL/);
  });

  it('refuses loopback and private addresses in any spelling', async () => {
    for (const host of ['127.0.0.1', '127.8.8.8', '10.0.0.1', '172.16.0.1', '172.31.9.9', '192.168.1.4', '169.254.1.1', '0.0.0.0', '100.64.0.1', '198.18.0.1', '224.0.0.1', '240.1.1.1']) {
      await expect(assertPublicHttpUrl(`http://${host}/`), host).rejects.toThrow(/not reachable/);
    }
    // Decimal and octal integer spellings of 127.0.0.1, and IPv6 loopback.
    await expect(assertPublicHttpUrl('http://2130706433/')).rejects.toThrow(/not reachable|does not resolve/);
    await expect(assertPublicHttpUrl('http://[::1]/')).rejects.toThrow(/not reachable/);
    await expect(assertPublicHttpUrl('http://[::ffff:127.0.0.1]/')).rejects.toThrow(/not reachable/);
    await expect(assertPublicHttpUrl('http://[fe80::1]/')).rejects.toThrow(/not reachable/);
    await expect(assertPublicHttpUrl('http://[fd00::1]/')).rejects.toThrow(/not reachable/);
  });

  it('judges IPv6 literals by the address they carry, without asking DNS (which answers differently on each platform)', async () => {
    // IPv4 inside IPv6: mapped (the URL parser writes ::ffff:127.0.0.1 as ::ffff:7f00:1), compatible, NAT64 and 6to4.
    for (const host of ['[::ffff:7f00:1]', '[::ffff:a00:1]', '[::ffff:c0a8:104]', '[::7f00:1]', '[64:ff9b::7f00:1]', '[64:ff9b::a9fe:101]', '[2002:7f00:1::]', '[2002:a00:1::1]']) {
      await expect(assertPublicHttpUrl(`http://${host}/`), host).rejects.toThrow(/not reachable/);
    }
    // The whole link-local, site-local and multicast ranges, and documentation addresses.
    for (const host of ['[fe90::1]', '[febf::1]', '[fec0::1]', '[ff02::1]', '[2001:db8::1]']) {
      await expect(assertPublicHttpUrl(`http://${host}/`), host).rejects.toThrow(/not reachable/);
    }
    // A public IPv6 literal, and a public IPv4 inside IPv6, are allowed.
    for (const host of ['[2606:4700:4700::1111]', '[::ffff:101:101]', '[64:ff9b::101:101]']) {
      await expect(assertPublicHttpUrl(`http://${host}/`), host).resolves.toBeInstanceOf(URL);
    }
  });

  it('refuses internal-looking host names before they are resolved', async () => {
    for (const host of ['localhost', 'api.localhost', 'myserver.local', 'db.internal', 'host.lan', 'x.arpa']) {
      await expect(assertPublicHttpUrl(`http://${host}/`), host).rejects.toThrow(/not reachable/);
    }
  });

  it('refuses hosts that do not resolve', async () => {
    await expect(assertPublicHttpUrl('http://this-domain-does-not-exist-9812347.example')).rejects.toThrow(/does not resolve/);
  });
});
