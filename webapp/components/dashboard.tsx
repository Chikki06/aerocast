"use client"

import { AQIInterpretation } from "@/components/aqi-interpretation-guide"
import { AQIScore } from "@/components/aqi-score"
import { AQISummary } from "@/components/aqi-summary"
import { PollutantPrediction } from "@/components/pollutant"
import { BotIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { Bell, X } from "lucide-react"

interface DashboardProps {
  location: string
  dateTime: Date
  latitude?: number
  longitude?: number
}

interface AirQualityData {
  location: {
    latitude: number
    longitude: number
  }
  timezone: string
  units: {
    pm2_5: string
    pm10: string
    carbon_monoxide: string
    carbon_dioxide: string
    sulphur_dioxide: string
    nitrogen_dioxide: string
    ozone: string
  }
  current: {
    pm2_5: number
    pm10: number
    carbon_monoxide: number
    carbon_dioxide: number
    sulphur_dioxide: number
    nitrogen_dioxide: number
    ozone: number
  }
  changes: {
    pm2_5: number
    pm10: number
    carbon_monoxide: number
    carbon_dioxide: number
    sulphur_dioxide: number
    nitrogen_dioxide: number
    ozone: number
  }
  hourly: {
    historical: {
      time: string[]
      pollutants: {
        pm2_5: number[]
        pm10: number[]
        carbon_monoxide: number[]
        carbon_dioxide: number[]
        sulphur_dioxide: number[]
        nitrogen_dioxide: number[]
        ozone: number[]
      }
    }
    forecast: {
      time: string[]
      pollutants: {
        pm2_5: number[]
        pm10: number[]
        carbon_monoxide: number[]
        carbon_dioxide: number[]
        sulphur_dioxide: number[]
        nitrogen_dioxide: number[]
        ozone: number[]
      }
    }
  }
  summary: {
    total_readings: number
    forecast_readings: number
    last_updated: string
    data_range: string
  }
}

export function Dashboard({
  location,
  dateTime,
  latitude = 47.6,
  longitude = -122.3,
}: DashboardProps) {
  const [userPrompt, setUserPrompt] = useState("")
  const [userPromptLoading, setUserPromptLoading] = useState(false)
  const [userPromptResponse, setUserPromptResponse] = useState<string>("")
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifEmail, setNotifEmail] = useState("")
  const [notifSaved, setNotifSaved] = useState(false)
  const [notifError, setNotifError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem("aq_notifications_email")
      if (saved) setNotifEmail(saved)
    } catch (e) {
      // ignore
    }
  }, [])
  const [airQualityData, setAirQualityData] = useState<AirQualityData | null>(
    null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Mock AQI calculation - in production, you'd calculate this based on actual pollutant levels
  const calculateAQI = (pm25: number, pm10: number, ozone: number) => {
    if (pm25 <= 12) return Math.min(50, Math.max(0, (pm25 / 12) * 50))
    if (pm25 <= 35.4)
      return Math.min(100, Math.max(51, ((pm25 - 12) / (35.4 - 12)) * 49 + 51))
    if (pm25 <= 55.4)
      return Math.min(
        150,
        Math.max(101, ((pm25 - 35.4) / (55.4 - 35.4)) * 49 + 101)
      )
    return Math.min(
      200,
      Math.max(151, ((pm25 - 55.4) / (150.4 - 55.4)) * 49 + 151)
    )
  }

  // Format AI response: if it looks like HTML, pass through; otherwise do a small markdown -> HTML conversion
  const formatAIResponse = (raw: string) => {
    if (!raw) return ""
    // If it already contains HTML tags, assume it's formatted
    const looksLikeHTML = /<[^>]+>/.test(raw)
    if (looksLikeHTML) return raw

    // Escape HTML
    const escapeHtml = (str: string) =>
      str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;")
        .replace(" * ", "")

    let s = escapeHtml(raw)

    // Bold **text**
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")

    // Convert lines to paragraphs and simple lists
    const lines = s.split(/\r?\n/)
    let html = ""
    let inUl = false
    let inOl = false
    let paraBuffer = ""

    const closePara = () => {
      if (paraBuffer.trim()) {
        html += `<p>${paraBuffer.trim()}</p>`
        paraBuffer = ""
      }
    }

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) {
        // blank line -> close lists and paragraph
        if (inUl) {
          html += "</ul>"
          inUl = false
        }
        if (inOl) {
          html += "</ol>"
          inOl = false
        }
        closePara()
        continue
      }

      const ulMatch = line.match(/^[-\*]\s+(.+)$/)
      const olMatch = line.match(/^\d+\.\s+(.+)$/)

      if (ulMatch) {
        closePara()
        if (!inUl) {
          if (inOl) {
            html += "</ol>"
            inOl = false
          }
          html += "<ul>"
          inUl = true
        }
        html += `<li>${ulMatch[1]}</li>`
        continue
      }

      if (olMatch) {
        closePara()
        if (!inOl) {
          if (inUl) {
            html += "</ul>"
            inUl = false
          }
          html += "<ol>"
          inOl = true
        }
        html += `<li>${olMatch[1]}</li>`
        continue
      }

      // Normal line -> accumulate into paragraph
      if (inUl) {
        html += "</ul>"
        inUl = false
      }
      if (inOl) {
        html += "</ol>"
        inOl = false
      }
      paraBuffer += (paraBuffer ? " " : "") + line
    }

    if (inUl) html += "</ul>"
    if (inOl) html += "</ol>"
    closePara()

    return html
  }

  // Fetch AI response for user prompt
  const fetchUserPromptResponse = async (prompt?: string) => {
    const promptToUse = (prompt ?? userPrompt).trim()
    console.log("🤖 fetchUserPromptResponse called with prompt:", promptToUse)
    console.log("🤖 airQualityData exists:", !!airQualityData)
    console.log("🤖 promptToUse exists:", !!promptToUse)

    if (!airQualityData || !promptToUse) {
      console.log("🤖 Early return - missing data or prompt")
      return
    }
    // if caller passed a prompt param, make sure state reflects it
    if (prompt) setUserPrompt(prompt)
    setUserPromptLoading(true)
    setUserPromptResponse("")
    try {
      const currentPM25 = Math.round(airQualityData.current.pm2_5)
      const currentPM10 = Math.round(airQualityData.current.pm10)
      const currentNO2 = Math.round(airQualityData.current.nitrogen_dioxide)
      const currentO3 = Math.round(airQualityData.current.ozone)
      const pm25Change = airQualityData.changes.pm2_5
      const no2Change = airQualityData.changes.nitrogen_dioxide
      const o3Change = airQualityData.changes.ozone
      const aqiValue = Math.round(
        calculateAQI(currentPM25, currentPM10, currentO3)
      )
      const response = await fetch("/api/gemini-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          location,
          aqi: aqiValue,
          pm25: currentPM25,
          pm10: currentPM10,
          no2: currentNO2,
          so2: currentSO2,
          co2: currentCO2,
          o3: currentO3,
          pm25Change,
          pm10Change,
          no2Change,
          so2Change,
          co2Change,
          o3Change,
          dateTime: dateTime.toISOString(),
          userPrompt: promptToUse,
        }),
      })
      if (!response.ok) throw new Error("Failed to fetch AI response")
      const data = await response.json()
      console.log("AI response data:", data)
      // API might return HTML or plain text. Prefer an "analysisHtml" field if present.
      const analysis = data.analysisHtml ?? data.analysis ?? ""
      setUserPromptResponse(analysis)
    } catch (err) {
      setUserPromptResponse(
        "Sorry, there was an error getting a response from AI."
      )
    } finally {
      setUserPromptLoading(false)
    }
  }

  // Convert Markdown to HTML and sanitize
  const sanitizeHtml = (rawText: string) => {
    if (!rawText) return ""

    let html = rawText

    // Convert Markdown headers (### Header, ## Header, # Header)
    html = html.replace(/^#{3}\s+(.+)$/gm, "<h3>$1</h3>")
    html = html.replace(/^#{2}\s+(.+)$/gm, "<h2>$1</h2>")
    html = html.replace(/^#{1}\s+(.+)$/gm, "<h1>$1</h1>")

    // Convert **bold** to <strong>
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")

    // Convert *italic* to <em>
    html = html.replace(/\*(.*?)\*/g, "<em>$1</em>")

    // Convert bullet points (- or * at start of line)
    html = html.replace(/^[-\*]\s+(.+)$/gm, "<li>$1</li>")

    // Wrap consecutive <li> items in <ul>
    const liMatches = html.match(/(<li>.*<\/li>\s*)+/g)
    if (liMatches) {
      liMatches.forEach((match) => {
        html = html.replace(match, `<ul>${match}</ul>`)
      })
    }

    // Convert numbered lists (1. at start of line)
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li class="numbered">$1</li>')

    // Wrap consecutive numbered <li> items in <ol>
    const numberedLiMatches = html.match(/(<li class="numbered">.*<\/li>\s*)+/g)
    if (numberedLiMatches) {
      numberedLiMatches.forEach((match) => {
        const cleanedMatch = match.replace(/ class="numbered"/g, "")
        html = html.replace(match, `<ol>${cleanedMatch}</ol>`)
      })
    }

    // Convert line breaks to paragraphs (split on double newlines)
    const paragraphs = html.split(/\n\s*\n/)
    html = paragraphs
      .map((p) => {
        const trimmed = p.trim()
        if (!trimmed) return ""
        // Don't wrap if it's already wrapped in HTML tags
        if (trimmed.startsWith("<") && trimmed.endsWith(">")) return trimmed
        return `<p>${trimmed}</p>`
      })
      .filter((p) => p)
      .join("")

    // Remove any script/style tags and dangerous attributes for security
    html = html.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    html = html.replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "")
    html = html.replace(/javascript:\s*/gi, "")

    return html
  }

  useEffect(() => {
    const fetchAirQualityData = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(
          `/api/air-quality?latitude=${latitude}&longitude=${longitude}`
        )

        if (!response.ok) {
          throw new Error("Failed to fetch air quality data")
        }

        const data = await response.json()
        console.log("Fetched air quality data:", data)
        setAirQualityData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error occurred")
        console.error("Error fetching air quality data:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchAirQualityData()
  }, [latitude, longitude])

  // Calculate current values (using the most recent data point)
  const getCurrentValue = (values: number[]) => {
    return values.length > 0 ? Math.round(values[0]) : 0
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="sticky top-0 z-10 py-3 px-0 mt-4 bg-gray-200 rounded-lg shadow-xl shadow-gray-200">
          <div className="flex items-center justify-between px-6">
            <div>
              <h2 className="text-2xl font-semibold text-balance">
                {location}
              </h2>
              <p className="text-sm text-muted-foreground">
                Loading air quality data...
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mx-4 mb-4">
          <div className="lg:col-span-3 text-center py-8">
            <p>Loading air quality data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !airQualityData) {
    return (
      <div className="space-y-4">
        <div className="sticky top-0 z-10 py-3 px-0 mt-4 bg-gray-200 rounded-lg shadow-xl shadow-gray-200">
          <div className="flex items-center justify-between px-6">
            <div>
              <h2 className="text-2xl font-semibold text-balance">
                {location}
              </h2>
              <p className="text-sm text-muted-foreground">
                Error loading data
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mx-4 mb-4">
          <div className="lg:col-span-3 text-center py-8">
            <p className="text-red-500">
              Error: {error || "Failed to load air quality data"}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Use current values from API response
  const currentPM25 = airQualityData
    ? Math.round(airQualityData.current.pm2_5)
    : 0
  const currentPM10 = airQualityData
    ? Math.round(airQualityData.current.pm10)
    : 0
  const currentNO2 = airQualityData
    ? Math.round(airQualityData.current.nitrogen_dioxide)
    : 0
  const currentO3 = airQualityData
    ? Math.round(airQualityData.current.ozone)
    : 0
  const currentSO2 = airQualityData
    ? Math.round(airQualityData.hourly.historical.pollutants.sulphur_dioxide[0])
    : 0
  const currentCO2 = airQualityData
    ? Math.round(airQualityData.hourly.historical.pollutants.carbon_dioxide[0])
    : 0

  // Get percentage changes
  const pm25Change = airQualityData ? airQualityData.changes.pm2_5 : 0
  const pm10Change = airQualityData ? airQualityData.changes.pm10 : 0
  const no2Change = airQualityData ? airQualityData.changes.nitrogen_dioxide : 0
  const o3Change = airQualityData ? airQualityData.changes.ozone : 0
  const so2Change = airQualityData ? airQualityData.changes.sulphur_dioxide : 0
  const co2Change = airQualityData ? airQualityData.changes.carbon_dioxide : 0

  const aqiValue = Math.round(calculateAQI(currentPM25, currentPM10, currentO3))

  const pollutants = {
    no2: currentNO2,
    o3: currentO3,
    pm: currentPM25,
    pm10: currentPM10,
    so2: currentSO2,
    co2: currentCO2,
  }

  return (
    <div className="space-y-4 ">
      {/* Sticky header so city/date/time remain visible while scrolling */}
      <div className="sticky top-0 z-10 py-3 px-0 mt-4 bg-gray-200 rounded-lg shadow-xl shadow-gray-200">
        <div className="flex items-center justify-between px-6 ">
          <div className="">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold text-balance">
                {location}
              </h2>
              {/* Notification button next to city name */}
              <button
                aria-label="Notifications"
                title="Notifications"
                onClick={() => {
                  setNotifOpen((v) => !v)
                  setNotifSaved(false)
                  setNotifError(null)
                }}
                className="p-1 rounded hover:bg-gray-300/60 cursor-pointer"
              >
                <Bell className="w-5 h-5 text-gray-700" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              {dateTime.toLocaleString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
        {/* Notification panel (simple inline panel anchored in header) */}
        {notifOpen && (
          <div className="mt-2 px-6 pb-4">
            <div className="max-w-md w-full bg-white border border-border/60 rounded-2xl shadow-md p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">Get notifications</h3>
                  <p className="text-sm text-muted-foreground">
                    Enter an email to receive alerts for {location}.
                  </p>
                </div>
                <button
                  aria-label="Close notifications"
                  onClick={() => setNotifOpen(false)}
                  className="p-1 rounded hover:bg-gray-100"
                >
                  <X className="w-4 h-4 text-gray-600" />
                </button>
              </div>

              <input
                type="email"
                placeholder="you@example.com"
                value={notifEmail}
                onChange={(e) => {
                  setNotifEmail(e.target.value)
                  setNotifError(null)
                  setNotifSaved(false)
                }}
                className="border px-1 py-2 rounded-md w-full"
              />
              {notifError && (
                <p className="text-xs text-red-600">{notifError}</p>
              )}

              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
                  onClick={() => {
                    // simple email validation
                    const email = notifEmail.trim()
                    if (!email) {
                      setNotifError("Please enter an email")
                      return
                    }
                    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                    if (!valid) {
                      setNotifError("Please enter a valid email")
                      return
                    }
                    try {
                      localStorage.setItem("aq_notifications_email", email)
                    } catch (e) {
                      // ignore storage errors
                    }
                    setNotifSaved(true)
                    setNotifError(null)
                  }}
                >
                  Send
                </button>
                <button
                  className="px-3 py-1 rounded border text-sm"
                  onClick={() => {
                    setNotifEmail("")
                    setNotifSaved(false)
                    setNotifError(null)
                  }}
                >
                  Clear
                </button>
                {notifSaved && (
                  <span className="text-sm text-green-600">Saved</span>
                )}
              </div>
            </div>
          </div>
        )}
        {/* <ProgressiveBlur
          className="absolute top-0 left-0 w-full h-full bg-gradient-to-t from-bg-gray-200/50 to-bge-gray-200 -z-1 rounded-lg"
          direction="top"
        /> */}
      </div>

      {/* Bento grid layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mx-4 mb-4">
        {/* Summary - spans 2 columns on large screens */}
        <div className="lg:col-span-3">
          <AQISummary
            aqi={aqiValue}
            location={location}
            pollutants={pollutants}
          />
        </div>

        {/* AQI Score */}
        <div>
          <AQIScore value={aqiValue} />
        </div>

        {/* Pollutant predictions */}

        <div className="lg:col-span-2">
          <PollutantPrediction
            pollutant="PM 2.5"
            value={currentPM25}
            unit="μg/m³"
            description="Particulate Matter"
            data={airQualityData.hourly.historical.pollutants.pm2_5}
            timeLabels={airQualityData.hourly.historical.time}
            forecastData={airQualityData.hourly.forecast.pollutants.pm2_5}
            forecastTimeLabels={airQualityData.hourly.forecast.time}
            changePercent={pm25Change}
          />
        </div>
        <div className="lg:col-span-2">
          <PollutantPrediction
            pollutant="PM 10"
            value={currentPM10}
            unit="μg/m³"
            description="Particulate Matter"
            data={airQualityData.hourly.historical.pollutants.pm10}
            timeLabels={airQualityData.hourly.historical.time}
            forecastData={airQualityData.hourly.forecast.pollutants.pm10}
            forecastTimeLabels={airQualityData.hourly.forecast.time}
            changePercent={pm10Change}
          />
        </div>

        <div className="lg:col-span-2">
          <PollutantPrediction
            pollutant="SO₂"
            value={currentSO2}
            unit="μg/m³"
            description="Sulfur Dioxide"
            data={airQualityData.hourly.historical.pollutants.sulphur_dioxide}
            timeLabels={airQualityData.hourly.historical.time}
            forecastData={
              airQualityData.hourly.forecast.pollutants.sulphur_dioxide
            }
            forecastTimeLabels={airQualityData.hourly.forecast.time}
            changePercent={so2Change}
          />
        </div>
        <div className="lg:col-span-2">
          <PollutantPrediction
            pollutant="CO₂"
            value={currentCO2}
            unit="μg/m³"
            description="Carbon Dioxide"
            data={airQualityData.hourly.historical.pollutants.carbon_dioxide}
            timeLabels={airQualityData.hourly.historical.time}
            forecastData={
              airQualityData.hourly.forecast.pollutants.carbon_dioxide
            }
            forecastTimeLabels={airQualityData.hourly.forecast.time}
            changePercent={co2Change}
          />
        </div>

        <div className="lg:col-span-2">
          <PollutantPrediction
            pollutant="NO₂"
            value={currentNO2}
            unit="μg/m³"
            description="Nitrogen Dioxide"
            data={airQualityData.hourly.historical.pollutants.nitrogen_dioxide}
            timeLabels={airQualityData.hourly.historical.time}
            forecastData={
              airQualityData.hourly.forecast.pollutants.nitrogen_dioxide
            }
            forecastTimeLabels={airQualityData.hourly.forecast.time}
            changePercent={no2Change}
          />
        </div>

        <div className="lg:col-span-2">
          <PollutantPrediction
            pollutant="O₃"
            value={currentO3}
            unit="μg/m³"
            description="Ozone"
            data={airQualityData.hourly.historical.pollutants.ozone}
            timeLabels={airQualityData.hourly.historical.time}
            forecastData={airQualityData.hourly.forecast.pollutants.ozone}
            forecastTimeLabels={airQualityData.hourly.forecast.time}
            changePercent={o3Change}
          />
        </div>

        {/* AQI Interpretation - spans 3 column */}
        <div className="lg:col-span-4">
          <AQIInterpretation value={aqiValue} />
        </div>

        {/* AI Chat Interface - spans 3 columns */}
        <div className="lg:col-span-4">
          <div className="bg-white p-6 rounded-lg shadow-md border">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <BotIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">AeroCast AI</h3>
                <p className="text-sm text-gray-600">
                  Your intelligent air quality assistant
                </p>
              </div>
            </div>
            <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl border border-blue-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">
                  Live Air Quality Data
                </span>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-gray-500">Real-time</span>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-600">
                    AQI {aqiValue}
                  </div>
                  <div className="text-xs text-gray-500">Air Quality</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-orange-600">
                    {currentPM25}
                  </div>
                  <div className="text-xs text-gray-500">PM₂.₅ µg/m³</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-red-600">
                    {currentNO2}
                  </div>
                  <div className="text-xs text-gray-500">NO₂ µg/m³</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">
                    {currentO3}
                  </div>
                  <div className="text-xs text-gray-500">O₃ µg/m³</div>
                </div>
              </div>
            </div>
            {/* User NL prompt input */}
            <form
              className="mt-6 flex gap-2 items-center"
              onSubmit={(e) => {
                e.preventDefault()
                console.log(
                  "🚀 Form submitted, calling fetchUserPromptResponse"
                )
                fetchUserPromptResponse()
              }}
            >
              <input
                type="text"
                className="flex-1 border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent shadow-sm"
                placeholder="Ask me anything about the air quality in your area..."
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                disabled={userPromptLoading}
              />
              <button
                type="submit"
                className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded text-white flex items-center justify-center disabled:opacity-60"
                disabled={userPromptLoading || !userPrompt.trim()}
                title="Ask AI"
              >
                {/* Wand icon */}
                <BotIcon className="w-5 h-5" />
              </button>
            </form>
            {/* AI response to user prompt */}
            {userPromptLoading ? (
              <div className="mt-3 text-blue-500 text-sm">
                AI is thinking...
              </div>
            ) : userPromptResponse ? (
              <div
                className="mt-3 border rounded p-4 bg-gray-50 ai-response"
                // show either raw text or HTML returned by AI; sanitize before injecting
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(userPromptResponse),
                }}
              />
            ) : (
              <div className="mt-4">
                <p className="text-sm text-gray-600 mb-3">Try asking:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Is it safe to exercise outside today?",
                    "What's causing these pollution levels?",
                    "Should I close my windows?",
                    "When will air quality improve?",
                  ].map((example) => (
                    <button
                      key={example}
                      type="button"
                      className="text-sm px-4 py-2 rounded-full border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors disabled:opacity-60"
                      onClick={async () => {
                        setUserPrompt(example)
                        await fetchUserPromptResponse(example)
                      }}
                      disabled={userPromptLoading}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
