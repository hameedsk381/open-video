import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// The landing page (site/page.html) is built into a standalone index.html. The address of the hosted app goes into two spots only when it is
// given, and only when it is a safe address, so the page never ships a dead link, a placeholder or an attribute that can be broken out of.
const site: any = await import(pathToFileURL(resolve('site/build.mjs')).href);
const fragment = readFileSync(resolve('site/page.html'), 'utf8');
const links = (page: string) => (page.match(/>Open the app<\/a>/g) ?? []).length;

describe('the landing page build', () => {
  it('keeps the two app-link spots in the page, so they are not lost in an edit', () => {
    expect(fragment).toContain('<!--app-nav-->');
    expect(fragment).toContain('<!--app-cta-->');
  });

  it('has no app link, and no leftover marker, when no address is given', () => {
    const page = site.renderPage(fragment);
    expect(links(page)).toBe(0);
    expect(page).not.toContain('app-nav');
    expect(page).not.toContain('app-cta');
    expect(page.startsWith('<!doctype html>')).toBe(true);
    expect((page.match(/<title>/g) ?? []).length).toBe(1);
  });

  it('links to the app from the menu and under the headline when an address is given', () => {
    const page = site.renderPage(fragment, 'https://app.example.com');
    expect(links(page)).toBe(2);
    expect(page.match(/href="https:\/\/app\.example\.com"/g)?.length).toBe(2);
  });

  it('accepts an https address with a port or a path, and http on localhost for a test', () => {
    for (const ok of ['https://app.example.com', 'https://app.example.com:8443', 'https://example.com/studio', 'http://localhost:3100', 'http://127.0.0.1:3100/']) {
      expect(() => site.checkAppUrl(ok), ok).not.toThrow();
    }
    expect(site.checkAppUrl('')).toBe('');
    expect(site.checkAppUrl(undefined)).toBe('');
  });

  it('refuses anything that is not a plain https address, or could break out of the link', () => {
    for (const bad of ['javascript:alert(1)', 'http://example.com', 'ftp://example.com', 'https://x.com/" onmouseover="alert(1)', 'https://x.com/<script>', "https://x.com/'x", 'app.example.com', 'https://', 'data:text/html,hi']) {
      expect(() => site.checkAppUrl(bad), bad).toThrow(/APP_URL/);
    }
  });
});
