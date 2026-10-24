import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Scroll motion without a library. One rAF-throttled scroll loop drives every parallax / progress
 * subscriber; reveals use IntersectionObserver. Everything is a no-op under prefers-reduced-motion.
 */

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

type Tick = () => void
const ticks = new Set<Tick>()
let frame = 0
const run = () => {
  frame = 0
  ticks.forEach((t) => t())
}
const schedule = () => {
  if (!frame) frame = requestAnimationFrame(run)
}

function onScrollFrame(tick: Tick) {
  if (ticks.size === 0) {
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
  }
  ticks.add(tick)
  tick()
  return () => {
    ticks.delete(tick)
    if (ticks.size === 0) {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }
}

/**
 * Marks the element `data-in` once its top passes `offset` (fraction of the viewport from the bottom).
 * Position-based rather than IntersectionObserver: a fast scroll or a jump can carry an element
 * across the whole viewport between two observer checks, and it must still count as seen.
 * A data attribute rather than a class: React rewrites className on re-render and would drop it.
 * Stagger children with the CSS var --i.
 */
export function useReveal<T extends HTMLElement>(offset = 0.12): RefObject<T | null> {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) {
      el.dataset.in = ''
      return
    }
    let stop: (() => void) | null = null
    stop = onScrollFrame(() => {
      const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
      // Content near the end of the page can never scroll up to the reveal line, so the bottom counts too.
      const visible = el.getBoundingClientRect().top < window.innerHeight
      if (el.getBoundingClientRect().top < window.innerHeight * (1 - offset) || (atBottom && visible)) {
        el.dataset.in = ''
        // Unsubscribing inside the first synchronous tick would run before `stop` is assigned.
        queueMicrotask(() => stop?.())
      }
    })
    return () => stop?.()
  }, [offset])
  return ref
}

/**
 * Writes the element's scroll offset relative to the viewport centre into `--py` (px, multiplied by
 * `speed`). CSS decides what to move: `transform: translateY(var(--py))`, background-position, etc.
 */
export function useParallax<T extends HTMLElement>(speed: number): RefObject<T | null> {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    return onScrollFrame(() => {
      const r = el.getBoundingClientRect()
      const fromCentre = r.top + r.height / 2 - window.innerHeight / 2
      el.style.setProperty('--py', `${(-fromCentre * speed).toFixed(1)}px`)
    })
  }, [speed])
  return ref
}

/**
 * 0 → 1 as the page scrolls through the first `distance` px; written to `--p` on the element.
 * Used for the hero that condenses into a sticky header.
 */
export function useScrollProgress<T extends HTMLElement>(distance: number): RefObject<T | null> {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) {
      el.style.setProperty('--p', '0')
      return
    }
    return onScrollFrame(() => {
      const p = Math.min(Math.max(window.scrollY / distance, 0), 1)
      el.style.setProperty('--p', p.toFixed(3))
    })
  }, [distance])
  return ref
}

/**
 * Progress (0 → 1) of a tall "scrollytelling" container through the viewport, as React state
 * rounded to `steps`, plus `--p` on the element for continuous CSS motion.
 */
export function useSectionProgress<T extends HTMLElement>(steps: number): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [step, setStep] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) {
      el.style.setProperty('--p', '1')
      el.classList.add('reduced')
      return
    }
    return onScrollFrame(() => {
      const r = el.getBoundingClientRect()
      const total = r.height - window.innerHeight
      const p = total > 0 ? Math.min(Math.max(-r.top / total, 0), 1) : 1
      el.style.setProperty('--p', p.toFixed(3))
      setStep(Math.min(Math.floor(p * steps), steps - 1))
    })
  }, [steps])
  return [ref, step]
}

/** Which of the given element ids is currently under the reading line (35% from the top). */
export function useScrollSpy(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null)
  const key = ids.join('|')
  useEffect(() => {
    const list = key ? key.split('|') : []
    return onScrollFrame(() => {
      const line = window.innerHeight * 0.35
      let current: string | null = null
      for (const id of list) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= line) current = id
      }
      setActive((prev) => (prev === current ? prev : current))
    })
  }, [key])
  return active
}
