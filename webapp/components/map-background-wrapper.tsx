"use client"

import dynamic from "next/dynamic"

interface MapBackgroundWrapperProps {
  latitude?: number
  longitude?: number
  zoom?: number
}

const MapBackgroundComponent = dynamic(() => import("./map-background"), {
  ssr: false,
})

const MapBackgroundWrapper = ({
  latitude,
  longitude,
  zoom,
}: MapBackgroundWrapperProps) => {
  return (
    <MapBackgroundComponent
      latitude={latitude}
      longitude={longitude}
      zoom={zoom}
    />
  )
}

export default MapBackgroundWrapper
