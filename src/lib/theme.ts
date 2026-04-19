export type Theme = 'light' | 'dark'

const KEY = 'theme'

export function getStoredTheme(): Theme {
  const t = localStorage.getItem(KEY)
  return t === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem(KEY, theme)
}

export function toggleTheme(): Theme {
  const next: Theme = getStoredTheme() === 'dark' ? 'light' : 'dark'
  applyTheme(next)
  return next
}
