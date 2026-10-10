import { useState } from 'react'
import { applyTheme, getStoredTheme, THEMES, type Theme } from '../lib/theme'

const LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' }

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  const choose = (t: Theme) => {
    setTheme(t)
    applyTheme(t)
  }

  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      {THEMES.map((t) => (
        <button key={t} type="button" aria-pressed={theme === t} onClick={() => choose(t)}>
          {LABEL[t]}
        </button>
      ))}
    </div>
  )
}
