"use client"

import AnimatedDashboard from "@/components/animated-dashboard"
import EntryForm from "@/components/entry-form"
import MapBackground from "@/components/map-background-wrapper"
import { BubbleBackground } from "@/components/ui/bubble-background"
import { ProgressiveBlur } from "@/components/ui/progressive-blur"
import { onDashboardClose } from "@/lib/ui-events"
import { cn } from "@/lib/utils"
import { parseDate } from "chrono-node"
import { useState, useEffect } from "react"

export default function Home() {
  const [showSearchOnly, setShowSearchOnly] = useState(true)
  const [location, setLocation] = useState<string | null>(null)
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [dateTime, setDateTime] = useState<string | null>(null)

  // Listen for dashboard close events so we can return to the default search-only view
  // and clear the selected location/date so the page returns to its default state.
  useEffect(() => {
    const off = onDashboardClose(() => {
      console.log("🚀 Dashboard closed, returning to search-only view")
      setShowSearchOnly(true)
      setLocation(null)
      setLatitude(null)
      setLongitude(null)
      setDateTime(null)
    })
    return () => off()
  }, [])

  return (
    <div className="flex flex-row items-center justify-start min-h-screen bg-gray-100">
      <EntryForm
        centered={showSearchOnly}
        onStateChange={(state) => {
          setLocation(state.location)
          setLatitude(state.latitude)
          setLongitude(state.longitude)
          console.log("Selected date:", state.date)
          setDateTime(state.date || null)
          if (state.location) {
            setShowSearchOnly(false)
          } else {
            setShowSearchOnly(true)
          }
        }}
      />
      {/* floating darkened blur 400px */}
      {/* <ProgressiveBlur
        className="fixed z-9 top-0 left-0 w-full h-[200px] bg-gradient-to-b from-black/50 to-transparent"
        direction="top"
      /> */}
      {/* radial blur */}
      {/* Keep bubble background mounted so we can animate opacity when toggling search/dashboard */}
      <BubbleBackground
        interactive={false}
        className={cn(
          "fixed z-9 top-0 left-0 w-full h-full transition-opacity duration-400",
          showSearchOnly
            ? "opacity-25 pointer-events-none"
            : "opacity-0 pointer-events-none"
        )}
        colors={{
          // blue-green-sky color scheme
          first: "29, 138, 176", // blue-600
          second: "20, 244, 126", // teal-500
          third: "26, 242, 172", // cyan-500
          fourth: "29, 138, 176", // red-500
          fifth: "29, 138, 176", // red-400
          sixth: "29, 118, 156", // red-600
        }}
      >
        <div className="fixed z-9 top-0 left-0 w-full h-full pointer-events-none bg-transparent backdrop-blur-sm" />
      </BubbleBackground>
      {/* <div className="mt-8 w-full max-w-md h-64 bg-white border border-gray-300 rounded-md flex items-center justify-center">
        <span className="text-gray-500">Placeholder</span>
      </div> */}
      {!showSearchOnly &&
        location &&
        latitude &&
        longitude &&
        dateTime &&
        parseDate(dateTime) && (
          <>
            <ProgressiveBlur
              className="fixed z-9 top-0 left-0 w-full h-[200px] bg-gradient-to-b from-black/50 to-transparent"
              direction="top"
            />

            {/* Fixed animated dashboard sheet that slides up from bottom */}
            <AnimatedDashboard
              location={location}
              dateTime={parseDate(dateTime) || undefined}
              latitude={latitude}
              longitude={longitude}
            />
          </>
        )}
      <MapBackground
        latitude={latitude || undefined}
        longitude={longitude || undefined}
        zoom={10}
      />
    </div>
  )
}
