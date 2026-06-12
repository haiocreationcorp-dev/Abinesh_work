import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const TOPBAR = 'linear-gradient(90deg, #FF8C00 0%, #FF5722 28%, #C2185B 62%, #7C3AED 100%)';

const DARK = {
  '--t-accent':        '#F97316',
  '--t-accent-light':  'rgba(249,115,22,0.12)',
  '--t-bg':            '#0a0a18',
  '--t-bg2':           '#1a1a2e',
  '--t-bg3':           '#1e1e3a',
  '--t-surface':       '#111827',
  '--t-border':        '#2a2a4a',
  '--t-border2':       '#1a1a3a',
  '--t-text':          '#e2e8f0',
  '--t-text-muted':    '#94a3b8',
  '--t-text-faint':    '#64748b',
  '--t-icon-bar':      '#0d0d20',
  '--t-canvas-bg':     '#181830',
  '--t-strip-bg':      '#0d0d20',
  '--t-panel-border':  '#3a3a5a',
  '--t-panel-empty':   '#181830',
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
  '--t-panel-border':  '#F97316',
  '--t-panel-empty':   '#ffffff',
  '--t-topbar':        TOPBAR,
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem('bc-theme') || 'dark');

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
