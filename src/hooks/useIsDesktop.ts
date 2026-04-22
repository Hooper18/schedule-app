import { useEffect, useState } from 'react'

// Mirrors Tailwind's `md:` breakpoint (≥768px). Used by calendar views to
// branch layout-level behavior (pixel-per-hour density, grid columns) that
// can't be expressed via CSS media queries alone because they flow through
// inline style props.
const QUERY = '(min-width: 768px)'

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return window.matchMedia(QUERY).matches
  })

  useEffect(() => {
    const mql = window.matchMedia(QUERY)
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isDesktop
}
