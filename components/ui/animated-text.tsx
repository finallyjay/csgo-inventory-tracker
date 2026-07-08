"use client"

import "slot-text/style.css"
import { useSyncExternalStore } from "react"
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
 * Slot-machine roll for short changing labels (values, totals). Falls back to
 * a plain <span> under prefers-reduced-motion, which slot-text does not
 * handle itself.
 */
export function AnimatedText({ text, className }: AnimatedTextProps) {
  const reducedMotion = useSyncExternalStore(subscribeToReducedMotion, prefersReducedMotion, () => false)

  if (reducedMotion) {
    return <span className={className}>{text}</span>
  }

  return <SlotText text={text} className={className} options={ROLL_OPTIONS} />
}
