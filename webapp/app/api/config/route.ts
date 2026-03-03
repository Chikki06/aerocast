import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiKey = process.env.GOOGLE_API_KEY || "";
    console.log("🔍 Config API called");
    console.log("🔑 API key found:", !!apiKey);
    console.log("📏 API key length:", apiKey.length);
    console.log("🔗 API key preview:", apiKey ? `${apiKey.substring(0, 10)}...` : "none");

    return NextResponse.json({
      googleMapsApiKey: apiKey,
    });
  } catch (error) {
    console.error("❌ Error fetching config:", error);
    return NextResponse.json({ error: "Failed to fetch configuration" }, { status: 500 });
  }
}
