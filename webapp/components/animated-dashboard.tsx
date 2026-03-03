"use client"

import { Dashboard } from "@/components/dashboard"
import { emitDashboardClose } from "@/lib/ui-events"
import { useEffect, useRef, useState } from "react"

interface AnimatedDashboardProps {
  location?: string
  dateTime?: Date
  latitude?: number
  longitude?: number
}

export default function AnimatedDashboard({
  location = "San Francisco, CA",
  dateTime = new Date(),
  latitude,
  longitude,
}: AnimatedDashboardProps) {
  const [visible, setVisible] = useState(false)
  const [enlarged, setEnlarged] = useState(false)
  const lastY = useRef<number>(0)
  const rafId = useRef<number | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)

  // Respect prefers-reduced-motion
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  // Slide up into view after mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 120)
    const focusTimeout = setTimeout(() => {
      if (closeButtonRef.current) closeButtonRef.current.focus()
    }, 260)

    // detect reduced motion
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
      setPrefersReducedMotion(Boolean(mq.matches))
      const handler = (e: MediaQueryListEvent) =>
        setPrefersReducedMotion(Boolean(e.matches))
      try {
        mq.addEventListener("change", handler)
      } catch {
        // Safari fallback
        // @ts-ignore
        mq.addListener(handler)
      }
      return () => {
        clearTimeout(t)
        clearTimeout(focusTimeout)
        try {
          mq.removeEventListener("change", handler)
        } catch {
          // @ts-ignore
          mq.removeListener(handler)
        }
      }
    }

    return () => {
      clearTimeout(t)
      clearTimeout(focusTimeout)
    }
  }, [])

  // Track scroll direction to enlarge on scroll-up
  useEffect(() => {
    lastY.current = typeof window !== "undefined" ? window.scrollY : 0

    function onScroll() {
      if (rafId.current) cancelAnimationFrame(rafId.current)
      rafId.current = requestAnimationFrame(() => {
        const y = window.scrollY
        const delta = lastY.current - y

        // If user scrolled up more than 12px, enlarge. If scrolled down more than 12px, shrink.
        if (delta > 12) setEnlarged(true)
        else if (delta < -12) setEnlarged(false)

        lastY.current = y
      })
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      if (rafId.current) cancelAnimationFrame(rafId.current)
    }
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // close the sheet and emit a dashboard close event so the page can restore the search
        setVisible(false)
        try {
          emitDashboardClose()
        } catch {}
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div
      aria-hidden={false}
      className={`fixed right-4 top-4 pointer-events-auto z-50 flex justify-end transition-[height] duration-500 ease-out pb-5`}
    >
      <div
        className={`w-[48vw] transform origin-right transition-[transform,box-shadow,opacity] duration-500 ease-out shadow-xl rounded-lg bg-gray-200 backdrop-blur-md border border-border/60 overflow-hidden`}
        style={{
          // translateY to create slide up; scale for enlarge effect
          // transform: `${visible ? "translateY(0)" : "translateY(-110%)"} ${
          //   enlarged ? " scale(1.04)" : " scale(0.985)"
          // }`,
          opacity: visible ? 1 : 0,
          // reduce height by ~200px from viewport height
        }}
      >
        <div className={`relative`}>
          {/* Close button */}
          <button
            ref={closeButtonRef}
            onClick={() => {
              setVisible(false)
              try {
                emitDashboardClose()
              } catch {}
            }}
            aria-label="Close dashboard"
            className="absolute right-5 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-md text-black hover:bg-black/10 transition-all focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <span aria-hidden>×</span>
          </button>

          {/* Scrollable content box */}
          <div
            className="overflow-y-auto"
            style={{ maxHeight: "calc(100vh - 40px)" }}
          >
            <Dashboard
              location={location}
              dateTime={dateTime}
              latitude={latitude}
              longitude={longitude}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
