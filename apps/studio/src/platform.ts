// The modifier key people see in shortcut hints: Cmd on a Mac, Ctrl elsewhere. The key handlers accept both.
const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
export const modKey = mac ? '⌘' : 'Ctrl';
export const modKeyLabel = (key: string) => (mac ? `⌘${key}` : `Ctrl+${key}`);
