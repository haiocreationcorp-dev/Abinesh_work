import { createContext, useContext, useState, useEffect, useCallback } from 'react';

// App-wide light/dark toggle for the general UI chrome (Navbar, Configure, Dashboard).
// Deliberately separate from ThemeContext.jsx, which controls only the Comic Editor's own
// canvas theme (--t-* variables, localStorage key 'bc-theme') — unrelated feature, same name
// would be confusing. This one flips the general --primary/--dark/--light/etc. variables
// in index.css via a [data-theme="dark"] selector on <html>.
const UIThemeContext = createContext(null);

export function UIThemeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem('bc_ui_theme') || 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    localStorage.setItem('bc_ui_theme', mode);
  }, [mode]);

  const toggle = useCallback(() => setMode((m) => (m === 'dark' ? 'light' : 'dark')), []);

  return (
    <UIThemeContext.Provider value={{ mode, toggle }}>
      {children}
    </UIThemeContext.Provider>
  );
}

export const useUITheme = () => useContext(UIThemeContext);
