"use client"

import "slot-text/style.css"
import { useEffect, useState, useSyncExternalStore } from "react"
import { SlotText } from "slot-text/react"
import type { SlotOptions } from "slot-text"

// Single tuning point for every rolling label in the app.
const ROLL_OPTIONS: SlotOptions = {
  duration: 300,
  stagger: 45,
  bounce: 0.6,
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

function subscribeToReducedMotion(onChange: () => void) {
  const mql = window.matchMedia(REDUCED_MOTION_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function prefersReducedMotion() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

type AnimatedTextProps = {
  text: string
  className?: string
}

/**
 * Slot-machine roll for short changing labels (values, totals). Rolls in on
 * mount too: the first paint masks every digit to 0 (same width, symbols and
 * separators static) and the real digits roll in right after, so each page
 * load gets the animation — not just later value changes. Falls back to a
 * plain <span> under prefers-reduced-motion, which slot-text does not handle
 * itself.
 */
export function AnimatedText({ text, className }: AnimatedTextProps) {
  const reducedMotion = useSyncExternalStore(subscribeToReducedMotion, prefersReducedMotion, () => false)
  const [display, setDisplay] = useState(() => text.replace(/\d/g, "0"))

  useEffect(() => {
    setDisplay(text)
  }, [text])

  if (reducedMotion) {
    return <span className={className}>{text}</span>
  }

  // aria-label pins the accessible name to the real value even while the
  // masked first frame is on screen.
  return <SlotText text={display} aria-label={text} className={className} options={ROLL_OPTIONS} />
}
