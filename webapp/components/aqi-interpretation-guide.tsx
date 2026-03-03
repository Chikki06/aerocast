"use client";

import { Card } from "@/components/ui/card";

interface AQIInterpretationProps {
  value: number;
}

export function AQIInterpretation({ value }: AQIInterpretationProps) {
  const categories = [
    {
      range: "0-50",
      label: "Good",
      color: "oklch(0.70 0.15 145)",
      description: "Air quality is satisfactory, and air pollution poses little or no risk.",
    },
    {
      range: "51-100",
      label: "Moderate",
      color: "oklch(0.75 0.15 85)",
      description: "Air quality is acceptable. However, there may be a risk for some people.",
    },
    {
      range: "101-150",
      label: "Unhealthy for Sensitive Groups",
      color: "oklch(0.70 0.15 55)",
      description: "Members of sensitive groups may experience health effects.",
    },
    {
      range: "151-200",
      label: "Unhealthy",
      color: "oklch(0.60 0.18 35)",
      description: "Some members of the general public may experience health effects.",
    },
    {
      range: "201-300",
      label: "Very Unhealthy",
      color: "oklch(0.50 0.18 15)",
      description: "Health alert: The risk of health effects is increased for everyone.",
    },
    {
      range: "301+",
      label: "Hazardous",
      color: "oklch(0.40 0.15 340)",
      description: "Health warning of emergency conditions: everyone is more likely to be affected.",
    },
  ];

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">AQI Interpretation Guide</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((category) => (
          <div key={category.range} className="p-4 rounded-lg border border-border bg-card/50">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: category.color }} />
              <div>
                <div className="font-semibold text-sm">{category.label}</div>
                <div className="text-xs text-muted-foreground">{category.range}</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{category.description}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
