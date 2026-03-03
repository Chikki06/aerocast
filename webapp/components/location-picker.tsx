"use client"

import { Button } from "@/components/ui/button"
import { GhostInput } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { LoaderCircle, Locate, MapPin, MapPinned, Search } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"

type LocationSuggestion = {
  display_name: string
  place_id: number
  address: {
    city?: string
    county?: string
    state?: string
    country?: string
    [key: string]: string | undefined
  }
  lat: string
  lon: string
}

export type LocationObject = { name: string; lat: number; lon: number }

interface LocationPickerProps {
  className?: string
  autoDetectOnLoad?: boolean
  defaultLocation?: string
  onChange?: (location: LocationObject) => void
  variant?: "popover" | "inline"
  placeholder?: string
  reset?: boolean
}

function addressToTitle(address: LocationSuggestion["address"]) {
  if (address.suburb && address.city)
    return `${address.suburb}, ${address.city}`
  if (address.city) return address.city
  if (address.county) return address.county
  if (address.state) return address.state
  if (address.country) return address.country
  return ""
}

export function LocationPicker({
  className,
  autoDetectOnLoad = false,
  defaultLocation = "",
  onChange,
  variant = "popover",
  placeholder = "Enter city, district, or area",
  reset = false,
}: LocationPickerProps) {
  const [activeCity, setActiveCity] = useState(defaultLocation)
  const [activeLat, setActiveLat] = useState<number | null>(null)
  const [activeLon, setActiveLon] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [locationSearch, setLocationSearch] = useState("")
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Handle reset prop
  useEffect(() => {
    if (reset) {
      setActiveCity("")
      setLocationSearch("")
      setActiveLat(null)
      setActiveLon(null)
    }
  }, [reset])

  const API_URL = "https://nominatim.openstreetmap.org"

  const getLocation = async (lat: number, long: number) => {
    setIsLoading(true)
    try {
      const res = await fetch(
        `${API_URL}/reverse?lat=${lat}&lon=${long}&format=json`
      )
      const data = await res.json()
      // Format the reverse-geocoded result to prefer suburb/city and include state abbrev
      const city = formatLocationName(data as LocationSuggestion)
      if (city) setActiveCity(city)
      setActiveLat(lat)
      setActiveLon(long)
    } catch (error) {
      console.log("Error fetching location:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const searchLocation = async () => {
    if (!locationSearch.trim()) return

    setIsLoading(true)
    try {
      const res = await fetch(
        `${API_URL}/search?q=${encodeURIComponent(
          locationSearch
        )}&format=json&addressdetails=1&countrycodes=us`
      )
      const data = await res.json()

      if (data && data.length > 0) {
        const place = data[0]
        const city = formatLocationName(place as LocationSuggestion)
        setActiveCity(city)
        setLocationSearch("")
        setSuggestions([])
        setIsPopoverOpen(false)
        setActiveLat(Number(place.lat))
        setActiveLon(Number(place.lon))
      } else {
        console.log("No location found")
      }
    } catch (error) {
      console.log("Error searching location:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const getCurrentLocation = useCallback(() => {
    setIsLoading(true)
    setError(null)

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by this browser")
      setIsLoading(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords
        getLocation(latitude, longitude)
      },
      (error) => {
        let errorMessage = "Unable to retrieve location"
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location access denied by user"
            break
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information unavailable"
            break
          case error.TIMEOUT:
            errorMessage = "Location request timed out"
            break
        }
        setError(errorMessage)
        setIsLoading(false)
      },
      { timeout: 10000, enableHighAccuracy: true }
    )
  }, [])

  const fetchSuggestions = async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setSuggestions([])
      return
    }

    setIsFetchingSuggestions(true)
    try {
      const res = await fetch(
        `${API_URL}/search?q=${encodeURIComponent(
          query
        )}&format=json&addressdetails=1&limit=5&countrycodes=us`
      )
      const data = await res.json()
      setSuggestions(data)
    } catch (error) {
      console.log("Error fetching suggestions:", error)
      setSuggestions([])
    } finally {
      setIsFetchingSuggestions(false)
    }
  }

  const selectSuggestion = (suggestion: LocationSuggestion) => {
    const city = formatLocationName(suggestion)
    setActiveCity(city)
    setActiveLat(Number(suggestion.lat))
    setActiveLon(Number(suggestion.lon))
    setLocationSearch("")
    setSuggestions([])
    setIsPopoverOpen(false)
  }

  // US state name -> 2-letter abbreviation map
  const STATE_ABBREV: Record<string, string> = {
    alabama: "AL",
    alaska: "AK",
    arizona: "AZ",
    arkansas: "AR",
    california: "CA",
    colorado: "CO",
    connecticut: "CT",
    delaware: "DE",
    florida: "FL",
    georgia: "GA",
    hawaii: "HI",
    idaho: "ID",
    illinois: "IL",
    indiana: "IN",
    iowa: "IA",
    kansas: "KS",
    kentucky: "KY",
    louisiana: "LA",
    maine: "ME",
    maryland: "MD",
    massachusetts: "MA",
    michigan: "MI",
    minnesota: "MN",
    mississippi: "MS",
    missouri: "MO",
    montana: "MT",
    nebraska: "NE",
    nevada: "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    ohio: "OH",
    oklahoma: "OK",
    oregon: "OR",
    pennsylvania: "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    tennessee: "TN",
    texas: "TX",
    utah: "UT",
    vermont: "VT",
    virginia: "VA",
    washington: "WA",
    "west virginia": "WV",
    wisconsin: "WI",
    wyoming: "WY",
    "district of columbia": "DC",
  }

  // Prefer smaller locality fields (suburb/hamlet/village/town/city) over county
  // and format with a 2-letter state abbreviation when available.
  const formatLocationName = (suggestion: LocationSuggestion) => {
    const addr = suggestion.address || {}

    const placeNameCandidate =
      addr.suburb ||
      addr.hamlet ||
      addr.village ||
      addr.town ||
      addr.city ||
      addr.neighbourhood ||
      ""

    const fallbackName = addr.county || addr.state || addr.country || ""

    let stateOrRegion = ""
    if (addr.state) {
      const key = addr.state.toLowerCase()
      stateOrRegion =
        STATE_ABBREV[key] ||
        (addr.state.length === 2 ? addr.state.toUpperCase() : addr.state)
    } else if (addr.country) {
      stateOrRegion = addr.country
    }

    if (placeNameCandidate) {
      if (stateOrRegion) return `${placeNameCandidate}, ${stateOrRegion}`
      return placeNameCandidate
    }

    if (fallbackName) {
      if (stateOrRegion && fallbackName !== stateOrRegion)
        return `${fallbackName}, ${stateOrRegion}`
      return fallbackName
    }

    return suggestion.display_name.split(",")[0]
  }

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchSuggestions(locationSearch)
    }, 300)

    return () => {
      clearTimeout(handler)
    }
  }, [locationSearch])

  useEffect(() => {
    if (!isPopoverOpen) {
      setSuggestions([])
    }
  }, [isPopoverOpen])

  // Auto-detect location on load
  const [isFirstLoad, setIsFirstLoad] = useState(true)

  useEffect(() => {
    if (autoDetectOnLoad && !activeCity) {
      if (isFirstLoad) {
        getCurrentLocation()
        setIsFirstLoad(false)
      }
    }
  }, [autoDetectOnLoad, activeCity, getCurrentLocation, isFirstLoad])

  useEffect(() => {
    if (onChange && activeCity && activeLat !== null && activeLon !== null) {
      onChange({ name: activeCity, lat: activeLat, lon: activeLon })
    }
  }, [activeCity, activeLat, activeLon, onChange])

  if (variant === "inline") {
    return (
      <div className={cn("", className)}>
        <div className="">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <GhostInput
                placeholder={placeholder}
                value={activeCity || locationSearch}
                onChange={(e) => {
                  const value = e.target.value
                  setLocationSearch(value)
                  if (activeCity && value !== activeCity) {
                    setActiveCity("")
                    setActiveLat(null)
                    setActiveLon(null)
                  }
                }}
                onKeyUp={(e) =>
                  e.key === "Enter" &&
                  suggestions.length === 0 &&
                  searchLocation()
                }
                aria-label="Search for location"
                aria-describedby={
                  suggestions.length > 0 ? "suggestions-list" : undefined
                }
                className="py-8 border-border focus:border-primary focus:ring-primary/20 bg-transparent text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <Button
              className="rounded-md h-10 w-10 p-0 text-muted-background hover:text-foreground"
              variant="ghost"
              onClick={searchLocation}
              disabled={isLoading || !locationSearch.trim()}
              title="Search Location"
            >
              {isLoading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>

            <Button
              variant="ghost"
              onClick={getCurrentLocation}
              className="rounded-md h-10 w-10 p-0  hover:bg-secondary/80 text-muted-background hover:text-foreground"
            >
              <Locate className="h-4 w-4" />
            </Button>
          </div>
          <div className="absolute w-[20rem]">
            {suggestions.length > 0 && (
              <div
                id="suggestions-list"
                role="listbox"
                aria-label="Location suggestions"
                className="w-full bg-background rounded-md border border-border shadow-lg max-h-60 overflow-y-auto"
              >
                {suggestions.map((suggestion) => (
                  <div
                    key={suggestion.place_id}
                    role="option"
                    aria-selected={false}
                    tabIndex={0}
                    className="px-4 py-2 hover:bg-muted cursor-pointer border-b border-border last:border-0 transition-colors"
                    onClick={() => selectSuggestion(suggestion)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        selectSuggestion(suggestion)
                      }
                    }}
                  >
                    <div className="flex items-start">
                      <MapPinned
                        size={16}
                        className="mt-0.5 mr-2 shrink-0 text-primary"
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {formatLocationName(suggestion)}
                        </p>
                        <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                          {suggestion.display_name}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isFetchingSuggestions &&
              locationSearch.length >= 2 &&
              suggestions.length === 0 && (
                <div className="w-full bg-background rounded-md border border-border shadow-md p-4 text-center">
                  <LoaderCircle
                    size={20}
                    className="animate-spin mx-auto text-primary"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Searching locations...
                  </p>
                </div>
              )}

            {locationSearch.length >= 2 &&
              !isFetchingSuggestions &&
              suggestions.length === 0 && (
                <div className="w-full bg-background rounded-md border border-border shadow-md p-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    No locations found for &quot;{locationSearch}&quot;
                  </p>
                </div>
              )}

            {/* {error && (
              <div className="w-full bg-destructive/10 rounded-md border border-destructive/20 p-3 text-center">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )} */}
          </div>
        </div>
      </div>
    )
  }

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-2 text-muted-foreground hover:text-foreground border-b border-transparent hover:border-primary cursor-pointer px-3 py-2 transition-colors",
            className
          )}
        >
          <MapPin size={16} className="text-primary" />
          {isLoading ? (
            <div className="flex items-center gap-1">
              <LoaderCircle size={14} className="animate-spin" />
              <span className="text-sm">Locating...</span>
            </div>
          ) : (
            <span className="text-sm font-medium">
              {activeCity.length > 15
                ? activeCity.slice(0, 15) + "..."
                : activeCity || "Select Location"}
            </span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 shadow-lg dark:bg-background"
        side="bottom"
        align="start"
        sideOffset={4}
      >
        <div className="p-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <GhostInput
                placeholder={placeholder}
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
                onKeyUp={(e) =>
                  e.key === "Enter" &&
                  suggestions.length === 0 &&
                  searchLocation()
                }
                aria-label="Search for location"
                aria-describedby={
                  suggestions.length > 0 ? "suggestions-list" : undefined
                }
                className="bg-transparent text-foreground py-3"
              />
            </div>

            <Button
              className="rounded-md h-10 w-10 p-0 bg-primary hover:bg-primary/90 text-primary-foreground"
              variant="outline"
              onClick={searchLocation}
              disabled={isLoading || !locationSearch.trim()}
              title="Search Location"
            >
              {isLoading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </Button>

            <Button
              variant="outline"
              onClick={getCurrentLocation}
              className="rounded-md h-10 w-10 p-0 bg-secondary hover:bg-secondary/80 text-secondary-foreground"
              title="Use Current Location"
            >
              <Locate className="h-4 w-4" />
            </Button>
          </div>

          {suggestions.length > 0 && (
            <div className="z-50 mt-1 mb-4 w-full bg-background rounded-md border border-border shadow-lg max-h-60 overflow-y-auto">
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.place_id}
                  className="px-4 py-2 hover:bg-muted cursor-pointer border-b border-border last:border-0 transition-colors"
                  onClick={() => selectSuggestion(suggestion)}
                >
                  <div className="flex items-start">
                    <MapPinned
                      size={16}
                      className="mt-0.5 mr-2 shrink-0 text-primary"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {formatLocationName(suggestion)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                        {suggestion.display_name}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {isFetchingSuggestions &&
            locationSearch.length >= 2 &&
            suggestions.length === 0 && (
              <div className="z-50 mt-1 mb-4 w-full bg-background rounded-md border border-border shadow-md p-4 text-center">
                <LoaderCircle
                  size={20}
                  className="animate-spin mx-auto text-primary"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Searching locations...
                </p>
              </div>
            )}

          {locationSearch.length >= 2 &&
            !isFetchingSuggestions &&
            suggestions.length === 0 && (
              <div className="w-full bg-background rounded-md border border-border shadow-md p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  No locations found for &quot;{locationSearch}&quot;
                </p>
              </div>
            )}

          {error && (
            <div className="w-full bg-destructive/10 rounded-md border border-destructive/20 p-3 text-center">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
