import { NextRequest, NextResponse } from "next/server";

interface InferenceRequestBody {
  city: string;
  historical_data: {
    hourlytime: string[];
    hourlypm2_5: number[];
    hourlypm10: number[];
    hourlycarbon_dioxide: number[];
    hourly__sulphur_dioxide: number[];
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: InferenceRequestBody = await req.json();
    
    // Validate request body
    if (!body.city || !body.historical_data) {
      return NextResponse.json({ error: "Missing required fields: city and historical_data" }, { status: 400 });
    }

    // Prepare request for Azure ML endpoint
    const requestBody = JSON.stringify(body);
    
    const requestHeaders = new Headers({
      "Content-Type": "application/json"
    });

    // Replace this with the primary/secondary key, AMLToken, or Microsoft Entra ID token for the endpoint
    const apiKey = process.env.AZURE_ML_API_KEY;
    if (!apiKey) {
      console.error("Azure ML API key not found in environment variables");
      return NextResponse.json({ error: "ML inference service unavailable" }, { status: 503 });
    }
    
    requestHeaders.append("Authorization", "Bearer " + apiKey);
    
    // This header will force the request to go to a specific deployment.
    requestHeaders.append("azureml-model-deployment", "xgboost-model-1");

    const url = "https://aqi-prediction-sglxs.eastus2.inference.ml.azure.com/score";

    console.log("Making ML inference request for city:", body.city);
    
    const response = await fetch(url, {
      method: "POST",
      body: requestBody,
      headers: requestHeaders
    });

    if (!response.ok) {
      console.error("ML inference failed with status:", response.status);
      console.error("Response headers:", [...response.headers.entries()]);
      const errorText = await response.text();
      console.error("Error response:", errorText);
      return NextResponse.json({ error: "ML inference failed" }, { status: 500 });
    }

    const result = await response.json();
    console.log("ML inference successful for city:", body.city);
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error("Inference API error:", error);
    return NextResponse.json({ error: "Internal server error during ML inference" }, { status: 500 });
  }
}