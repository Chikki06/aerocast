"use client"

import { onDashboardClose } from "@/lib/ui-events"
import React, { useCallback, useEffect, useState } from "react"
import { CustomCalendar } from "./custom-calendar"
import { LocationObject, LocationPicker } from "./location-picker" // Assuming LocationPicker is a custom component

interface EntryFormProps {
  onStateChange?: (state: {
    location: string
    date: string | undefined
    latitude: number | null
    longitude: number | null
  }) => void
  centered?: boolean
}

const EntryForm: React.FC<EntryFormProps> = ({
  onStateChange = () => {},
  centered = false,
}) => {
  const [location, setLocation] = useState<LocationObject | null>(null)
  const [date, setDate] = useState<string | undefined>(undefined)
  const [isCentered, setIsCentered] = useState<boolean>(centered)
  const [shouldResetLocation, setShouldResetLocation] = useState<boolean>(false)

  // Update isCentered state when the centered prop changes
  useEffect(() => {
    setIsCentered(centered)
  }, [centered])

  useEffect(() => {
    // Subscribe to dashboard close events to center the search bar.
    const off = onDashboardClose(() => {
      setIsCentered(true)
      setLocation(null)
      setDate(undefined)
      setShouldResetLocation(true)

      // Also notify parent about the state change to ensure everything is in sync
      onStateChange({
        location: "",
        date: undefined,
        latitude: null,
        longitude: null,
      })
    })
    return () => off()
  }, [onStateChange])

  useEffect(() => {
    if (location && date) {
      onStateChange({
        location: location.name,
        date: date,
        latitude: location.lat,
        longitude: location.lon,
      })
    } else if (!location) {
      // When location is cleared, make sure to report empty values
      onStateChange({
        location: "",
        date: date,
        latitude: null,
        longitude: null,
      })
    }
  }, [location, date, onStateChange])

  return (
    <div>
      {/* Entry Form Section */}
      <div
        id="entry-search-bar"
        className="fixed z-10 bg-white/85 backdrop-blur-sm shadow-lg rounded-lg px-6 flex items-center"
        style={{
          width: "48vw",
          minWidth: "700px",
          top: isCentered ? "50%" : "1rem",
          left: isCentered ? "50%" : "1rem",
          transform: isCentered ? "translate(-50%, -50%)" : "none",
        }}
      >
        {/* Logo Section */}
        <div className="text-2xl font-bold text-gray-800 mr-4">AeroCast</div>

        {/* div separator */}
        <div className="border-l border-gray-200 h-10" />

        <div className="flex-1 relative mr-4">
          {/* <div className="absolute left-0 top-1/2 transform -translate-y-1/2 pointer-events-none">Location</div> */}
          <label htmlFor="location-search" className="sr-only">
            Search Location
          </label>
          <LocationPicker
            variant="inline"
            onChange={useCallback(
              (loc: LocationObject) => {
                setLocation(loc)
                setIsCentered(false)
                // Once we set the location, we're no longer resetting
                if (shouldResetLocation) {
                  setShouldResetLocation(false)
                }
              },
              [shouldResetLocation]
            )}
            placeholder="Location"
            reset={shouldResetLocation}
            // autoDetectOnLoad
            // defaultLocation="Chicago, IL"
          />
        </div>

        <div className="border-l border-gray-200 h-10" />

        <div className="flex-1">
          <label htmlFor="date-picker" className="sr-only">
            Select Date
          </label>
          <CustomCalendar
            onChange={(value: string) => {
              setDate(value)
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default EntryForm
