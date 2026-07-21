import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const TOPBAR = 'linear-gradient(90deg, #FF8C00 0%, #FF5722 28%, #C2185B 62%, #7C3AED 100%)';

// Two-tone dark theme: pure black for the rail/strip/panel body, and one gray for both the
// canvas area (fills the whole space behind the comic pages) and actual buttons/chips
// (--t-bg3), so the canvas reads as a distinct workspace against the black chrome around it.
const DARK_BLACK = '#000000';
const DARK_BTN_GRAY = '#1a1a1a';
const DARK = {
  '--t-accent':        '#F97316',
  '--t-accent-light':  'rgba(249,115,22,0.18)',
  '--t-bg':            DARK_BLACK,
  '--t-bg2':           DARK_BLACK,
  '--t-bg3':           DARK_BTN_GRAY,
  '--t-surface':       DARK_BLACK,
  '--t-border':        DARK_BLACK,
  '--t-border2':       DARK_BLACK,
  '--t-text':          '#ffffff',
  '--t-text-muted':    '#a3a3a3',
  '--t-text-faint':    '#777777',
  '--t-icon-bar':      DARK_BLACK,
  '--t-canvas-bg':     DARK_BTN_GRAY,
  '--t-strip-bg':      DARK_BLACK,
  '--t-panel-border':  DARK_BLACK,
  '--t-panel-empty':   DARK_BLACK,
  // A black inset shadow is invisible against this theme's near-black surfaces — use a
  // mid-gray instead so embossed edges (e.g. the page strip) actually read as recessed.
  '--t-emboss-shadow':  'rgba(120,120,120,0.35)',
  '--t-topbar':        TOPBAR,
};

const LIGHT = {
  '--t-accent':        '#F97316',
  '--t-accent-light':  'rgba(249,115,22,0.09)',
  '--t-bg':            '#f5f5fa',
  '--t-bg2':           '#ffffff',
  '--t-bg3':           '#f8f8fc',
  '--t-surface':       '#ffffff',
  '--t-border':        '#e4e4ee',
  '--t-border2':       '#ededf5',
  '--t-text':          '#1a1a2e',
  '--t-text-muted':    '#4a4a70',
  '--t-text-faint':    '#9090b0',
  '--t-icon-bar':      '#ffffff',
  '--t-canvas-bg':     '#f0f0f8',
  '--t-strip-bg':      '#ffffff',
  '--t-panel-border':  '#d1d5db',
  '--t-panel-empty':   '#ffffff',
  '--t-emboss-shadow':  'rgba(0,0,0,0.35)',
  '--t-topbar':        TOPBAR,
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem('bc-theme') || 'light');

  useEffect(() => {
    const vars = mode === 'dark' ? DARK : LIGHT;
    const root = document.documentElement;
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    localStorage.setItem('bc-theme', mode);
  }, [mode]);

  const toggle = useCallback(() => setMode((m) => (m === 'dark' ? 'light' : 'dark')), []);

  return (
    <ThemeContext.Provider value={{ mode, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
