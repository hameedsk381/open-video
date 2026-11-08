// The shell's own surfaces (the window behind the page, the page shown while the server starts, the page shown when it stops) wear the
// studio's theme, so opening the app never flashes a colour the studio does not use. The studio keeps its theme in the page's
// localStorage ("ove-theme": light, dark or system, light by default); the shell reads it back and remembers it for the next launch.
export const themeChoices = ['light', 'dark', 'system'];

/** A stored choice, or the studio's own default (light) when there is none or it is not one of the three. */
export const cleanTheme = value => (themeChoices.includes(value) ? value : 'light');

/** "system" follows the operating system; the other two are what they say. */
export const resolveTheme = (choice, prefersDark) => (cleanTheme(choice) === 'system' ? (prefersDark ? 'dark' : 'light') : cleanTheme(choice));

// The studio's tokens: --bg, --text, --muted and --faint in each theme, and the ink the primary button is drawn in.
export const shellColors = {
  light: { background: '#ffffff', text: '#111111', muted: '#525252', faint: '#6b6b6b', ink: '#111111' },
  dark: { background: '#0b0d12', text: '#f5f6fa', muted: '#929baa', faint: '#8791a1', ink: '#f4f4f5' },
};

export const shellPalette = (choice, prefersDark) => shellColors[resolveTheme(choice, prefersDark)];
