"use client";

import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface AQIScoreProps {
  value: number;
}

export function AQIScore({ value }: AQIScoreProps) {
  const getAQIColor = (aqi: number) => {
    if (aqi <= 50) return "oklch(0.70 0.15 145)";
    if (aqi <= 100) return "oklch(0.75 0.15 85)";
    if (aqi <= 150) return "oklch(0.70 0.15 55)";
    if (aqi <= 200) return "oklch(0.60 0.18 35)";
    if (aqi <= 300) return "oklch(0.50 0.18 15)";
    return "oklch(0.40 0.15 340)";
  };

  const getAQILabel = (aqi: number) => {
    if (aqi <= 50) return "Good";
    if (aqi <= 100) return "Moderate";
    if (aqi <= 150) return "Unhealthy for Sensitive Groups";
    if (aqi <= 200) return "Unhealthy";
    if (aqi <= 300) return "Very Unhealthy";
    return "Hazardous";
  };

  const percentage = Math.min((value / 300) * 100, 100);

  return (
    <Card className="p-6 h-full flex flex-col">
      <h3 className="text-lg font-semibold mb-4">AQI Score</h3>
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <div className="text-center">
          <div className="text-6xl font-bold mb-2" style={{ color: getAQIColor(value) }}>
            {value}
          </div>
          <div className="text-xl font-bold" style={{ color: getAQIColor(value) }}>
            {getAQILabel(value)}
          </div>
        </div>

        <div className="w-full relative mt-4">
          <div className="relative h-3 bg-secondary rounded-full overflow-hidden w-full flex">
            {[50, 100, 150, 200, 300].map((threshold, index, thresholds) => {
              const start = index === 0 ? 0 : thresholds[index - 1];
              const width = ((threshold - start) / 300) * 100;
              const isPastValue = value > threshold;
              const isCurrentRange = value > start && value <= threshold;

              return (
                <Tooltip key={threshold}>
                  <TooltipTrigger asChild>
                    <div
                      key={threshold}
                      className="h-full group relative"
                      style={{
                        width: `${width}%`,
                        backgroundColor: getAQIColor((start + threshold) / 2),
                        opacity: isPastValue ? 1 : isCurrentRange ? 1 : 0.3,
                      }}
                      title={getAQILabel(threshold)}
                    >
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-black text-white text-xs rounded px-2 py-1">
                        {getAQILabel(threshold)}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{getAQILabel(threshold)}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          {/* <div className="absolute top-0 left-0 h-3 bg-transparent rounded-full overflow-hidden w-full flex">
            {[50, 100, 150, 200, 300].map((threshold, index, thresholds) => {
              const start = index === 0 ? 0 : thresholds[index - 1];
              const width = ((threshold - start) / 300) * 100;
              const isPastValue = value > threshold;
              const isCurrentRange = value > start && value <= threshold;

              return (
                <div
                  key={threshold}
                  className="h-full"
                  style={{
                    width: `${width}%`,
                    boxShadow: `inset 0 0 0 1px ${getAQIColor((start + threshold) / 2)}`,
                    backgroundColor: "transparent",
                    opacity: isPastValue ? 0 : isCurrentRange ? 0 : 1,
                    borderRadius:
                      index === 0 ? "9999px 0 0 9999px" : index === thresholds.length - 1 ? "0 9999px 9999px 0" : "0",
                  }}
                  title={getAQILabel(threshold)}
                ></div>
              );
            })}
          </div> */}
          <div
            className="absolute -top-2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[12px] rotate-180"
            style={{
              left: `${percentage}%`,
              transform: `translateY(5px)`,
              borderBottomColor: getAQIColor(value),
            }}
          ></div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground"></div>
        </div>
      </div>
    </Card>
  );
}
