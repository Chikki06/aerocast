"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { AlertCircle, CheckCircle, Wind, Loader2 } from "lucide-react"

interface AQISummaryProps {
  aqi: number
  location: string
  pollutants?: {
    no2: number
    o3: number
    pm: number
  }
}

export function AQISummary({ aqi, location, pollutants }: AQISummaryProps) {
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (pollutants) {
      generateAISummary()
    }
  }, [aqi, location, pollutants])

  const generateAISummary = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/generate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aqi, location, pollutants }),
      })
      const data = await response.json()
      setAiSummary(data.summary)
    } catch (error) {
      console.error("[v0] Failed to generate AI summary:", error)
    } finally {
      setLoading(false)
    }
  }

  const getSafetyInfo = (aqiValue: number) => {
    if (aqiValue <= 50) {
      return {
        icon: CheckCircle,
        color: "text-[oklch(0.70_0.15_145)]",
        title: "Safe to Go Outside",
      }
    } else if (aqiValue <= 100) {
      return {
        icon: Wind,
        color: "text-[oklch(0.75_0.15_85)]",
        title: "Generally Safe",
      }
    } else if (aqiValue <= 150) {
      return {
        icon: AlertCircle,
        color: "text-[oklch(0.70_0.15_55)]",
        title: "Caution for Sensitive Groups",
      }
    } else {
      return {
        icon: AlertCircle,
        color: "text-[oklch(0.60_0.18_35)]",
        title: "Unhealthy Air Quality",
      }
    }
  }

  const info = getSafetyInfo(aqi)
  const Icon = info.icon

  return (
    <Card className="p-6 h-full">
      <div className="flex items-start gap-4">
        <div className={`${info.color} mt-1`}>
          <Icon className="w-8 h-8" />
        </div>
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="text-xl font-semibold mb-3">{info.title}</h3>
            {loading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">
                  Generating personalized health guidance...
                </span>
              </div>
            ) : aiSummary ? (
              <div className="prose prose-sm max-w-none">
                <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                  {aiSummary}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-muted-foreground leading-relaxed">
                  {aqi <= 50
                    ? "Air quality is excellent. Perfect conditions for outdoor activities and exercise. No health concerns for any population group."
                    : aqi <= 100
                    ? "Air quality is acceptable for most people. Unusually sensitive individuals may experience minor respiratory symptoms."
                    : aqi <= 150
                    ? "Members of sensitive groups may experience health effects. The general public is less likely to be affected."
                    : "Everyone may begin to experience health effects. Members of sensitive groups may experience more serious effects."}
                </p>
                <div className="pt-3 border-t border-border">
                  <h4 className="text-sm font-semibold mb-1 text-foreground">
                    Respiratory Health Advisory
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {aqi <= 50
                      ? "Safe for people with asthma, COPD, and other respiratory conditions."
                      : aqi <= 100
                      ? "People with respiratory conditions should monitor symptoms but can generally proceed with outdoor activities."
                      : aqi <= 150
                      ? "People with asthma, children, and older adults should limit prolonged outdoor exertion."
                      : "People with respiratory conditions should avoid outdoor activities. Everyone should reduce prolonged exertion."}
                  </p>
                </div>
              </div>
            )}
          </div>
          {aiSummary && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                AI-generated health guidance based on current air quality data
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
