import { NextRequest } from "next/server"

export async function GET(request: NextRequest, { params }: any) {
  try {
    const tileParts: string[] = params?.tile || []
    const path = tileParts.join("/")

    const key = process.env.STADIAMAPS_KEY

    // Build upstream URL; include API key server-side only
    const upstream = `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/${path}${
      key ? `?api_key=${encodeURIComponent(key)}` : ""
    }`

    const upstreamRes = await fetch(upstream)

    // Forward status and body, but control caching
    const headers = new Headers()
    const contentType = upstreamRes.headers.get("content-type")
    if (contentType) headers.set("content-type", contentType)

    // Cache on CDN for longer, but allow short browser caching
    headers.set("cache-control", "public, max-age=3600, s-maxage=86400")

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers,
    })
  } catch (err) {
    return new Response("Proxy error", { status: 502 })
  }
}
