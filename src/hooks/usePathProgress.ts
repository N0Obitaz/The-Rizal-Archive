import { useEffect, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Register once (idempotent) so this hook can be used on its own.
gsap.registerPlugin(ScrollTrigger)

/**
 * Returns the page's overall scroll progress as a number from 0 to 1.
 *
 * This is the single primitive the whole experience reads from:
 * - 0 = top of the page (childhood / start of the path)
 * - 1 = bottom of the page (adulthood / end of the path)
 *
 * It is backed by a ScrollTrigger that spans the entire document. We hold
 * the value in React state so components can re-render as it changes.
 * (For a scaffold with ~12 waypoints, a state update per scroll frame is
 * perfectly cheap. If this ever grows, swap to a subscription/ref-based
 * store that mutates DOM directly instead of re-rendering.)
 */
export function usePathProgress(): number {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const trigger = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => setProgress(self.progress),
    })

    return () => trigger.kill()
  }, [])

  return progress
}
