'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type InterfaceModePreference = 'auto' | 'mobile' | 'desktop';

type AppPreferences = {
  theme: ThemePreference;
  interfaceMode: InterfaceModePreference;
  setTheme: (theme: ThemePreference) => void;
  setInterfaceMode: (mode: InterfaceModePreference) => void;
};

const THEME_KEY = 'app_pref_theme';
const MODE_KEY = 'app_pref_interface_mode';

const AppPreferencesContext = createContext<AppPreferences | null>(null);

function resolveDark(theme: ThemePreference) {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function AppPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const [interfaceMode, setInterfaceModeState] = useState<InterfaceModePreference>('auto');

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_KEY) as ThemePreference | null;
    const storedMode = window.localStorage.getItem(MODE_KEY) as InterfaceModePreference | null;

    if (storedTheme === 'system' || storedTheme === 'light' || storedTheme === 'dark') {
      setThemeState(storedTheme);
    }

    if (storedMode === 'auto' || storedMode === 'mobile' || storedMode === 'desktop') {
      setInterfaceModeState(storedMode);
    }
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const isDark = resolveDark(theme);
      html.classList.toggle('dark', isDark);
    };

    applyTheme();
    media.addEventListener('change', applyTheme);

    return () => media.removeEventListener('change', applyTheme);
  }, [theme]);

  const value = useMemo<AppPreferences>(
    () => ({
      theme,
      interfaceMode,
      setTheme: (nextTheme) => {
        setThemeState(nextTheme);
        window.localStorage.setItem(THEME_KEY, nextTheme);
      },
      setInterfaceMode: (nextMode) => {
        setInterfaceModeState(nextMode);
        window.localStorage.setItem(MODE_KEY, nextMode);
      }
    }),
    [interfaceMode, theme]
  );

  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
}

export function useAppPreferences() {
  const context = useContext(AppPreferencesContext);
  if (!context) {
    throw new Error('useAppPreferences must be used within AppPreferencesProvider');
  }

  return context;
}
