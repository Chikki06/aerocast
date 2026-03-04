"use client"

import { useEffect, useState, useRef } from "react"
import { MapContainer, TileLayer, ZoomControl } from "react-leaflet"
import L from "leaflet"

interface MapBackgroundProps {
  latitude?: number
  longitude?: number
  zoom?: number
}

const MapBackground = ({ latitude, longitude, zoom }: MapBackgroundProps) => {
  const [apiKey, setApiKey] = useState<string>("")
  const [apiKeyLoading, setApiKeyLoading] = useState(true)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const tileCache = useRef<Map<string, HTMLImageElement>>(new Map())
  const mapRef = useRef<L.Map | null>(null)
  const requestCache = useRef<Set<string>>(new Set())
  const loadingTiles = useRef<Set<string>>(new Set())

  // Enhanced caching with localStorage backup
  const getCachedApiKey = () => {
    try {
      const cached = localStorage.getItem("google_maps_api_key")
      const cacheTime = localStorage.getItem("google_maps_api_key_time")

      if (cached && cacheTime) {
        const timeStamp = parseInt(cacheTime)
        const fiveMinutes = 5 * 60 * 1000

        // Use cached key if it's less than 5 minutes old
        if (Date.now() - timeStamp < fiveMinutes) {
          return cached
        }
      }
    } catch (error) {
      // localStorage might not be available
    }
    return null
  }

  const setCachedApiKey = (key: string) => {
    try {
      localStorage.setItem("google_maps_api_key", key)
      localStorage.setItem("google_maps_api_key_time", Date.now().toString())
    } catch (error) {
      // localStorage might not be available
    }
  }

  useEffect(() => {
    // Add a small delay to ensure client-side hydration is complete
    const timer = setTimeout(() => {
      fetchApiKey()
    }, 100)

    const fetchApiKey = async () => {
      try {
        setApiKeyLoading(true)
        setApiKeyError(null)

        // Try cached key first
        const cachedKey = getCachedApiKey()
        if (cachedKey) {
          console.log("✅ Using cached API key")
          setApiKey(cachedKey)
          setApiKeyLoading(false)
          return
        }

        // Ensure we're on the client side
        if (typeof window === "undefined") {
          console.log("⏳ Server-side rendering, skipping API call")
          return
        }

        // Fetch fresh key if no cache
        console.log("🔍 Attempting to fetch from /api/config")
        console.log("🌐 Current origin:", window.location.origin)
        console.log("🌐 Full URL:", `${window.location.origin}/api/config`)

        const response = await fetch("/api/config", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store", // Prevent caching issues
        })

        console.log("📡 Response status:", response.status)
        console.log("📡 Response ok:", response.ok)

        if (!response.ok) {
          const errorText = await response.text()
          console.error("❌ API Error Response:", errorText)
          throw new Error(
            `HTTP error! status: ${response.status}, body: ${errorText}`
          )
        }

        const data = await response.json()

        if (data.googleMapsApiKey) {
          setApiKey(data.googleMapsApiKey)
          setCachedApiKey(data.googleMapsApiKey) // Cache the key
        } else {
          setApiKeyError("No API key found")
        }
      } catch (error) {
        console.error("❌ Full API error:", error)

        // If it's a 404, provide helpful debugging info
        if (error instanceof Error && error.message.includes("404")) {
          console.error("🚨 API Route not found. Check:")
          console.error("1. Is Next.js dev server running? (npm run dev)")
          console.error("2. Is the file at /app/api/config/route.ts present?")
          console.error("3. Try restarting the dev server")
        }

        setApiKeyError(error instanceof Error ? error.message : "Unknown error")
      } finally {
        setApiKeyLoading(false)
      }
    }

    return () => clearTimeout(timer) // Cleanup timeout
  }, [])

  // Effect to handle map view changes when latitude and longitude change
  useEffect(() => {
    if (!mapRef.current) return

    // Animation options for smooth transitions
    const animationOptions = {
      duration: 1.5, // seconds
      easeLinearity: 0.25,
    }

    if (latitude && longitude) {
      // Calculate longitude offset based on zoom level
      // At higher zoom levels, we need smaller offsets
      const currentZoom = mapRef.current.getZoom()
      const targetZoom = (zoom || 10) + 5 // Increase zoom by 5 levels

      // Base offset to shift location to ~25% of screen width
      // The offset needs to be proportional to the zoom level - higher zoom = smaller offset
      let longitudeOffset = 0

      // Get the current map bounds to calculate appropriate offset
      if (mapRef.current) {
        const bounds = mapRef.current.getBounds()
        const currentBoundsWidth = bounds.getEast() - bounds.getWest()

        // Calculate the offset as a percentage of the current map width
        // 0.5 would move by 50% of the visible map width
        longitudeOffset = currentBoundsWidth * 0.00025
        console.log("📍 Longitude offset:", longitudeOffset)
      }

      // Create the offset center position
      // Shift the map view to the east (increasing longitude) to position our location point
      // at approximately 25% from the left of the screen
      const offsetCenter: L.LatLngExpression = [
        latitude,
        longitude + longitudeOffset,
      ]

      // Apply the smooth animation to the offset center
      mapRef.current.flyTo(offsetCenter, targetZoom, animationOptions)
    } else {
      // If no location provided, reset to default US view with animation
      mapRef.current.flyTo([37.0902, -95.7129], 5, animationOptions)
    }
  }, [latitude, longitude, zoom])

  return (
    <MapContainer
      center={[37.0902, -95.7129]} // Centered on the US
      zoom={5} // Zoomed out
      style={{
        height: "100vh",
        width: "100vw ",
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 1,
      }}
      zoomControl={false}
      ref={(map) => {
        if (map) mapRef.current = map
      }}
    >
      <TileLayer
        // Proxy tiles through a server-side API so the provider key stays secret
        url="/api/stadiamaps/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        keepBuffer={4}
        updateWhenIdle={true}
        updateWhenZooming={false}
        crossOrigin="anonymous"
      />

      {/* Air Quality Heatmap Overlay with Caching */}
      {apiKey && (
        <TileLayer
          url={`https://airquality.googleapis.com/v1/mapTypes/UAQI_RED_GREEN/heatmapTiles/{z}/{x}/{y}?key=${apiKey}`}
          attribution="Air Quality data &copy; Google"
          opacity={0.4}
          // Enable browser caching and optimization
          keepBuffer={4} // Keep 4 extra tile layers in memory
          updateWhenIdle={true} // Only update tiles when map is idle
          updateWhenZooming={false} // Don't update during zoom
          crossOrigin="anonymous"
          // Custom tile loading options for better caching
          eventHandlers={{
            tileload: (e: any) => {
              // Add cache headers via tile element
              const tile = e.tile as HTMLImageElement
              if (tile && tile.complete) {
                // Store successful tiles in cache for reuse
                const tileUrl = tile.src
                if (!tileCache.current.has(tileUrl)) {
                  tileCache.current.set(
                    tileUrl,
                    tile.cloneNode(true) as HTMLImageElement
                  )

                  // Limit cache size
                  if (tileCache.current.size > 150) {
                    const oldestKey = tileCache.current.keys().next().value
                    if (oldestKey) {
                      tileCache.current.delete(oldestKey)
                    }
                  }
                }
              }
            },
          }}
        />
      )}

      <ZoomControl position="bottomleft" />
    </MapContainer>
  )
}

export default MapBackground
