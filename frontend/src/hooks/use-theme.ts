import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem('theme') as Theme | null;
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyThemeClass(theme: Theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.setAttribute('data-theme', 'light');
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // MutationObserver: sync ALL hook instances when html.classList changes.
  // This makes every component that calls useTheme() re-render together,
  // regardless of which component initiated the toggle.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      setTheme((prev) => (prev !== current ? current : prev));
    });
    observer.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // When THIS instance changes theme, apply to DOM + persist
  useEffect(() => {
    applyThemeClass(theme);
    try {
      localStorage.setItem('theme', theme);
    } catch {}
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, toggleTheme, isDark: theme === 'dark' };
}
