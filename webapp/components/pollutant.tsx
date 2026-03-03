"use client"

import { Card } from "@/components/ui/card"
import { Minus, TrendingDown, TrendingUp } from "lucide-react"
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts"

interface PollutantPredictionProps {
  pollutant: string
  value: number
  unit: string
  description: string
  data?: number[] // Array of hourly values (historical data)
  timeLabels?: string[] // Array of time labels corresponding to historical data
  forecastData?: number[] // Array of forecast values
  forecastTimeLabels?: string[] // Array of time labels for forecast data
  changePercent?: number // Actual percentage change from 6h ago
}

export function PollutantPrediction({
  pollutant,
  value,
  unit,
  description,
  data = [],
  timeLabels = [],
  forecastData = [],
  forecastTimeLabels = [],
  changePercent = 0,
}: PollutantPredictionProps) {
  const getTrendData = () => {
    const combinedData = []

    // Prepare historical data (solid line)
    for (let i = 0; i < data.length; i++) {
      combinedData.push({
        value: data[i] || 0,
        time: timeLabels[i] || "",
        type: "historical",
      })
    }

    // Add the forecast data points
    for (let i = 0; i < forecastData.length; i++) {
      combinedData.push({
        value: forecastData[i] || 0,
        time: forecastTimeLabels[i] || "",
        type: "forecast",
      })
    }

    return combinedData
  }
  const combinedTrendData = getTrendData()

  // Compute min/max for the sparkline to make small changes more visible.
  const computeDomain = (arr: { value: number }[]) => {
    if (!arr || arr.length === 0) return undefined

    let min = Infinity
    let max = -Infinity
    for (const d of arr) {
      if (typeof d.value === "number") {
        if (d.value < min) min = d.value
        if (d.value > max) max = d.value
      }
    }

    if (min === Infinity || max === -Infinity) return undefined

    // Add a small padding so the line doesn't sit on the exact edge.
    // Use 5% of the range or a minimum padding of 1 unit for small ranges.
    const range = Math.max(0, max - min)
    const padding = range > 0 ? Math.max(range * 0.05, 1) : 1

    // YAxis domain in Recharts accepts [min, max] or ['dataMin', 'dataMax'] style.
    return [min - padding, max + padding]
  }

  const yDomain = computeDomain(combinedTrendData)

  // Calculate trend based on actual data or percentage change
  const getTrend = () => {
    if (changePercent > 5) return "up"
    if (changePercent < -5) return "down"
    return "stable"
  }

  const trend = getTrend()
  const change = Math.abs(changePercent)

  const getTrendIcon = () => {
    if (trend === "up") return TrendingUp
    if (trend === "down") return TrendingDown
    return Minus
  }

  const getTrendColor = () => {
    if (trend === "up") return "text-[oklch(0.60_0.18_35)]"
    if (trend === "down") return "text-[oklch(0.70_0.15_145)]"
    return "text-muted-foreground"
  }

  const getSparklineColor = () => {
    if (trend === "up") return "oklch(0.60 0.18 35)"
    if (trend === "down") return "oklch(0.70 0.15 145)"
    return "oklch(0.50 0.05 240)"
  }

  const TrendIcon = getTrendIcon()

  return (
    <Card className="p-6 h-full">
      <div className="space-y-4">
        <div>
          <div className="text-3xl font-bold mb-1">{pollutant}</div>
          <div className="text-sm text-muted-foreground">{description}</div>
        </div>

        <div className="flex items-baseline gap-2">
          <div className="text-4xl font-bold text-foreground">{value}</div>
          <div className="text-lg text-muted-foreground">{unit}</div>
        </div>

        <div className="h-12 -mx-2">
          {combinedTrendData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={combinedTrendData}>
                {yDomain ? (
                  <YAxis hide domain={yDomain as [number, number]} />
                ) : null}
                {/* Historical data line (solid) */}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={getSparklineColor()}
                  strokeWidth={2}
                  dot={{ fill: getSparklineColor(), strokeWidth: 0, r: 3 }}
                  activeDot={{ r: 2, fill: getSparklineColor() }}
                  isAnimationActive={false}
                  // Only include historical points by setting others to null
                  data={combinedTrendData.map((point) =>
                    point.type === "historical"
                      ? point
                      : { ...point, value: null }
                  )}
                  connectNulls={false}
                />

                {/* Forecast data line (dashed) */}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={getSparklineColor()}
                  strokeWidth={2}
                  strokeDasharray="4,4"
                  dot={false}
                  activeDot={{ r: 2, fill: getSparklineColor() }}
                  isAnimationActive={false}
                  // Only include forecast points by setting others to null
                  data={combinedTrendData.map((point, index, array) => {
                    // Include the last historical point to connect lines
                    const lastHistoricalIndex =
                      array.findIndex(
                        (p, i) =>
                          p.type === "forecast" &&
                          i > 0 &&
                          array[i - 1].type === "historical"
                      ) - 1

                    return point.type === "forecast" ||
                      index === lastHistoricalIndex
                      ? point
                      : { ...point, value: null }
                  })}
                  connectNulls={true}
                />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload
                      const value = payload[0].value

                      if (!data.time) return null

                      const pointDate = new Date(data.time)

                      // Just show the time without "ago" labels
                      const timeLabel = pointDate.toLocaleString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      })

                      return (
                        <div className="bg-background border border-border rounded-lg shadow-lg p-2 text-xs">
                          <p className="font-medium">
                            {timeLabel}: {Math.round(value)} {unit}
                          </p>
                          <p className="text-muted-foreground">
                            {pointDate.toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      )
                    }
                    return null
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
              No trend data available
            </div>
          )}
        </div>

        <div className={`flex items-center gap-2 ${getTrendColor()}`}>
          <TrendIcon className="w-4 h-4" />
          <span className="text-sm font-medium">
            {trend === "stable"
              ? "Stable"
              : `${Math.round(change)}% ${
                  trend === "up" ? "increase" : "decrease"
                }`}
          </span>
          <span className="text-xs text-muted-foreground">vs. 6 hours ago</span>
        </div>

        <div className="pt-4 border-t border-border">
          <div className="text-xs text-muted-foreground">
            {data.length > 0
              ? "Real-time data from Open-Meteo Air Quality API"
              : "Data from NASA TEMPO satellite and ground stations"}
          </div>
        </div>
      </div>
    </Card>
  )
}
