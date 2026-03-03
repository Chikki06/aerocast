import { GoogleGenAI } from "@google/genai";

import { NextRequest, NextResponse } from "next/server";
export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
    const { location, aqi, pm25, no2, o3, pm25Change, no2Change, o3Change, dateTime, userPrompt } = body;

    // Format the date for the analysis
    const analysisDate = new Date(dateTime);
    const formattedDate = analysisDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    // Construct the input data for the prompt
    const inputData = `
Region: ${location}
Period: ${formattedDate}
AQI: ${aqi}
Main pollutants: PM₂.₅ (${pm25} µg/m³), NO₂ (${no2} µg/m³), O₃ (${o3} µg/m³)
Changes: PM₂.₅ (${pm25Change > 0 ? "+" : ""}${pm25Change}%), NO₂ (${no2Change > 0 ? "+" : ""}${no2Change}%), O₃ (${
      o3Change > 0 ? "+" : ""
    }${o3Change}%)
Weather: Moderate winds, typical temperature for season
    `.trim();

    let prompt;
    if (typeof userPrompt === "string" && userPrompt.trim().length > 0) {
      prompt = `You're a friendly air quality expert helping someone understand their local conditions. Use the following data to answer their question naturally and conversationally.

${inputData}

Their question: "${userPrompt}"

Please respond in a helpful, conversational tone using proper Markdown formatting. Use:
- **Bold** for important points
- Bullet points for lists
- Clear sections if needed
- Keep it friendly and easy to understand, like you're talking to a neighbor who asked about the air quality.`;
    } else {
      prompt = `You're a friendly air quality expert giving someone a helpful update about their local air quality. Here's what you're seeing in the data:

${inputData}

Please provide a warm, informative summary using proper Markdown formatting. Start with a friendly greeting, then organize your response like this:

## Today's Air Quality Update

### How Things Look Right Now
Quick overview of the AQI and what that means for today

### What's Worth Noting  
Any pollutants or trends that stand out (keep it simple and clear)

### What This Means for You
Practical health info, especially if anyone should be more careful today

### Why Things Are This Way
Quick explanation of what might be causing current conditions

Write like you're helping out a friend or neighbor - be warm and approachable while staying informative. Use **bold** for the important stuff and bullet points when helpful. Keep technical terms simple!`;
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 350,
      },
    });
    console.log(response.text);
    return NextResponse.json({
      analysis: response.text,
      error: "Gemini response returned successfully",
    });
  } catch (error) {
    console.error("Gemini API error:", error);
    // Fallback analysis if API fails
    const location = body?.location || "this area";
    const aqi = body?.aqi || 0;
    const fallbackAnalysis = `Air quality in ${location} shows current conditions with an AQI of ${aqi}. Based on available data, pollutant levels indicate ${
      aqi > 100
        ? "elevated concentrations that may affect sensitive individuals"
        : "generally acceptable conditions for most people"
    }. Monitor conditions and follow local health advisories.`;

    return NextResponse.json({
      analysis: fallbackAnalysis,
      error: "Using fallback analysis due to API error",
    });
  }
}
