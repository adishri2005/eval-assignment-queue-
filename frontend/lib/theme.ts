// File: lib/theme.ts
// Purpose: Theme detection, toggle, persistence (localStorage key: 'eaq-theme').
//          Also exports the inline script string for flash prevention in <head>.

'use client';

const THEME_KEY = 'eaq-theme';
type Theme = 'light' | 'dark';

/**
 * Inline script to inject in <head> to prevent flash of wrong theme.
 * Runs before React hydration.
 */
export const themeScript = `
  (function() {
    try {
      var saved = localStorage.getItem('${THEME_KEY}');
      var preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', saved || preferred);
    } catch(e) {
      document.documentElement.setAttribute('data-theme', 'light');
    }
  })();
`;

/**
 * Get the current theme from the DOM.
 */
export function getTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return (document.documentElement.getAttribute('data-theme') as Theme) || 'light';
}

/**
 * Set the theme on <html> and persist to localStorage.
 */
export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

/**
 * Toggle between light and dark themes.
 * Applies a transition class during the switch for smooth color transitions.
 */
export function toggleTheme(): Theme {
  const current = getTheme();
  const next: Theme = current === 'light' ? 'dark' : 'light';

  // Add transition class
  document.documentElement.classList.add('theme-transitioning');

  // Apply new theme
  setTheme(next);

  // Remove transition class after animation completes
  setTimeout(() => {
    document.documentElement.classList.remove('theme-transitioning');
  }, 350);

  return next;
}
