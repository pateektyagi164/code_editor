import { useEffect } from 'react'

export function useClickOutside(ref, handler, enabled = true) {
  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    const onPointerDown = (event) => {
      const element = ref.current
      if (!element || element.contains(event.target)) {
        return
      }
      handler(event)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)

    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [ref, handler, enabled])
}
