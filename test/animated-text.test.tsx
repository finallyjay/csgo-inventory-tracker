import { render } from "@testing-library/react"
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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("AnimatedText", () => {
  it("renders the text through slot-text when motion is allowed", () => {
    mockMatchMedia(false)
    const { container } = render(<AnimatedText text="$1,234.56" />)
    // slot-text splits the label into per-character cells (each holding old and
    // new glyphs), so the accessible name — not textContent — is the contract.
    const root = container.querySelector(".slot-text")
    expect(root).not.toBeNull()
    expect(root).toHaveAttribute("aria-label", "$1,234.56")
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
    expect(container.querySelector(".slot-text")).toHaveAttribute("aria-label", "$12.50")
  })
})
