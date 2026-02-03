import { useEffect, useState } from 'react'

export function useIsMobile(maxWidthPx = 430, portraitOnly = false): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const query = `(max-width: ${maxWidthPx}px)`
    const mediaQuery = window.matchMedia(query)

    const portraitQuery = window.matchMedia('(orientation: portrait)')

    const update = () =>
      setIsMobile(
        mediaQuery.matches && (!portraitOnly || portraitQuery.matches)
      )

    update()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', update)
      portraitQuery.addEventListener('change', update)
      return () => {
        mediaQuery.removeEventListener('change', update)
        portraitQuery.removeEventListener('change', update)
      }
    }

    mediaQuery.addListener(update)
    portraitQuery.addListener(update)
    return () => {
      mediaQuery.removeListener(update)
      portraitQuery.removeListener(update)
    }
  }, [maxWidthPx, portraitOnly])

  return isMobile
}
