import { act, cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AnimatedText } from "@/components/ui/animated-text"

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList),
  )
}

// The roll-in setState is deferred to the next animation frame, so tests flush
// one frame before asserting on the rolled-in text.
async function flushFrame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  })
}

afterEach(() => {
  // Unmount before removing the matchMedia stub: a still-mounted AnimatedText
  // holds a pending animation frame whose setState would re-read matchMedia
  // after the stub is gone. (No vitest globals, so no auto-cleanup.)
  cleanup()
  vi.unstubAllGlobals()
})

describe("AnimatedText", () => {
  it("renders the text through slot-text when motion is allowed", async () => {
    mockMatchMedia(false)
    const { container } = render(<AnimatedText text="$1,234.56" />)
    // The accessible name — not textContent — is the contract: in a browser
    // slot-text splits the label into per-character cells, and since 0.3.3 it
    // probes whether its stylesheet applied and falls back to plain text when
    // it did not (always the case in jsdom), so the ".slot-text" class is no
    // longer a stable hook here.
    const root = container.querySelector("span")
    expect(root).not.toBeNull()
    expect(root).toHaveAttribute("aria-label", "$1,234.56")
    // First paint masks the digits; the real value rolls in a frame later.
    expect(root?.textContent).toBe("$0,000.00")
    await flushFrame()
    expect(root?.textContent).toBe("$1,234.56")
  })

  it("falls back to a plain span under prefers-reduced-motion", () => {
    mockMatchMedia(true)
    const { container } = render(<AnimatedText text="$1,234.56" className="text-accent" />)
    const span = container.querySelector("span.text-accent")
    expect(span).not.toBeNull()
    expect(span?.textContent).toBe("$1,234.56")
    // Plain fallback: no slot-text cell structure inside.
    expect(span?.children.length).toBe(0)
  })

  it("updates the accessible name when the prop changes", () => {
    mockMatchMedia(false)
    const { container, rerender } = render(<AnimatedText text="$10.00" />)
    rerender(<AnimatedText text="$12.50" />)
    expect(container.querySelector("span")).toHaveAttribute("aria-label", "$12.50")
  })
})
