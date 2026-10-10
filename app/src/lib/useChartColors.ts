import { useMemo, useSyncExternalStore } from 'react'

const DARK = '(prefers-color-scheme: dark)'

function subscribe(onChange: () => void) {
  // The theme switcher sets data-theme on <html>; "System" follows the OS, so listen to both.
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const media = matchMedia(DARK)
  media.addEventListener('change', onChange)
  return () => {
    observer.disconnect()
    media.removeEventListener('change', onChange)
  }
}

const scheme = () => document.documentElement.dataset.theme ?? (matchMedia(DARK).matches ? 'dark' : 'light')

export interface ChartColors {
  accent: string
  fg: string
  muted: string
  border: string
  surface: string
  bg: string
}

/** The app's CSS colour tokens, for libraries (like ECharts) that draw on a canvas and can't use CSS variables. */
export function useChartColors(): ChartColors {
  const current = useSyncExternalStore(subscribe, scheme, () => 'light')
  return useMemo(() => {
    void current // recompute whenever the theme changes
    const css = getComputedStyle(document.documentElement)
    const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
    return {
      accent: v('--accent', '#2557d6'),
      fg: v('--fg', '#1a1d23'),
      muted: v('--muted', '#5b6370'),
      border: v('--border', '#dde1e7'),
      surface: v('--surface', '#f5f6f8'),
      bg: v('--bg', '#ffffff'),
    }
  }, [current])
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia('(prefers-reduced-motion: reduce)')
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  )
}
