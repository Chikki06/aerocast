import { NextRequest, NextResponse } from "next/server";
import { json } from "stream/consumers";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const latitude = searchParams.get("latitude");
  const longitude = searchParams.get("longitude");

  if (!latitude || !longitude) {
    return NextResponse.json({ error: "Missing latitude or longitude parameters" }, { status: 400 });
  }

  // Validate latitude and longitude are valid numbers
  const lat = parseFloat(latitude);
  const lon = parseFloat(longitude);

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: "Invalid latitude or longitude values" }, { status: 400 });
  }

  // Calculate date range: last 2 days to ensure we have recent data
  const currentDate = new Date();
  const endDate = currentDate.toISOString().split("T")[0]; // Today YYYY-MM-DD format
  const startDate = new Date(currentDate.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]; // 2 days ago

  // Fetch both historical and forecast data
  const historicalUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&hourly=pm2_5,carbon_monoxide,sulphur_dioxide,pm10,carbon_dioxide,nitrogen_dioxide,ozone&start_date=${startDate}&end_date=${endDate}`;
  const forecastUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&hourly=pm10,pm2_5,carbon_dioxide,nitrogen_dioxide,ozone,sulphur_dioxide&forecast_days=1`;

  try {
    // Fetch both historical and forecast data in parallel
    const [historicalResponse, forecastResponse] = await Promise.all([
      fetch(historicalUrl),
      fetch(forecastUrl)
    ]);

    if (!historicalResponse.ok || !forecastResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch air quality data from external API" }, { status: 500 });
    }

    const [historicalData, forecastData] = await Promise.all([
      historicalResponse.json(),
      forecastResponse.json()
    ]);

    // Helper function to calculate percentage change
    const calculatePercentageChange = (currentValue: number, pastValue: number): number => {
      if (!pastValue || pastValue === 0) return 0;
      return Math.round(((currentValue - pastValue) / pastValue) * 100);
    };

    // Get the most recent 6 hours of historical data based on current time
    const historicalTimes = historicalData.hourly?.time || [];
    const currentTime = new Date();
    
    // Find the index closest to current time in historical data
    let currentIndex = -1;
    let smallestDifference = Infinity;
    
    historicalTimes.forEach((timeStr: string, index: number) => {
      const dataTime = new Date(timeStr);
      const difference = Math.abs(currentTime.getTime() - dataTime.getTime());
      if (difference < smallestDifference) {
        smallestDifference = difference;
        currentIndex = index;
      }
    });
    
    // If we found a valid current index, get the last 6 hours from that point
    // If no valid index found, default to the last 6 entries
    if (currentIndex === -1) {
      currentIndex = historicalTimes.length - 1;
    }
    
    const last6HoursStart = Math.max(0, currentIndex - 5); // Get 6 hours including current
    const last6HoursEnd = Math.min(historicalTimes.length, currentIndex + 1);

    const getLast6Hours = (pollutantArray: number[]) => {
      const values = pollutantArray.slice(last6HoursStart, last6HoursEnd) || [];
      const timeLabels = historicalTimes.slice(last6HoursStart, last6HoursEnd) || [];
      return { values, times: timeLabels };
    };

    // Get next 6 hours of forecast data starting from the hour after the last historical data point
    const forecastTimes = forecastData.hourly?.time || [];
    const getNext6HoursForecast = (pollutantArray: number[]) => {
      // Get the last historical time to find where forecast should start
      const lastHistoricalTime = historicalTimes[last6HoursEnd - 1];
      if (!lastHistoricalTime) {
        return { values: [], times: [] };
      }
      
      const lastHistoricalDate = new Date(lastHistoricalTime);
      
      // Find the first forecast time that's after the last historical time
      let forecastStartIndex = -1;
      for (let i = 0; i < forecastTimes.length; i++) {
        const forecastTime = new Date(forecastTimes[i]);
        if (forecastTime > lastHistoricalDate) {
          forecastStartIndex = i;
          break;
        }
      }
      
      if (forecastStartIndex === -1) {
        return { values: [], times: [] };
      }
      
      const forecastEndIndex = Math.min(forecastTimes.length, forecastStartIndex + 6);
      const values = pollutantArray.slice(forecastStartIndex, forecastEndIndex) || [];
      const timeLabels = forecastTimes.slice(forecastStartIndex, forecastEndIndex) || [];
      return { values, times: timeLabels };
    };

    // Get last 6 hours of historical data for all pollutants
    const pm25Last6 = getLast6Hours(historicalData.hourly?.pm2_5 || []);
    const pm10Last6 = getLast6Hours(historicalData.hourly?.pm10 || []);
    const no2Last6 = getLast6Hours(historicalData.hourly?.nitrogen_dioxide || []);
    const o3Last6 = getLast6Hours(historicalData.hourly?.ozone || []);
    const coLast6 = getLast6Hours(historicalData.hourly?.carbon_monoxide || []);
    const co2Last6 = getLast6Hours(historicalData.hourly?.carbon_dioxide || []);
    const so2Last6 = getLast6Hours(historicalData.hourly?.sulphur_dioxide || []);

    // Get next 6 hours of forecast data for all pollutants
    const pm25Forecast6 = getNext6HoursForecast(forecastData.hourly?.pm2_5 || []);
    const pm10Forecast6 = getNext6HoursForecast(forecastData.hourly?.pm10 || []);
    const no2Forecast6 = getNext6HoursForecast(forecastData.hourly?.nitrogen_dioxide || []);
    const o3Forecast6 = getNext6HoursForecast(forecastData.hourly?.ozone || []);
    const coForecast6 = getNext6HoursForecast(forecastData.hourly?.carbon_monoxide || []);
    const co2Forecast6 = getNext6HoursForecast(forecastData.hourly?.carbon_dioxide || []);
    const so2Forecast6 = getNext6HoursForecast(forecastData.hourly?.sulphur_dioxide || []);

    // Calculate current vs 6 hours ago change
    const getCurrentAndPastValues = (values: number[]) => {
      const current = values[values.length - 1] || 0; // Most recent reading
      const past = values[0] || 0; // 6 hours ago reading
      return { current, past, change: calculatePercentageChange(current, past) };
    };

    const pm25Data = getCurrentAndPastValues(pm25Last6.values);
    const pm10Data = getCurrentAndPastValues(pm10Last6.values);
    const no2Data = getCurrentAndPastValues(no2Last6.values);
    const o3Data = getCurrentAndPastValues(o3Last6.values);
    const coData = getCurrentAndPastValues(coLast6.values);

    // Get ML predictions using the last 25 hours of data
    let mlPredictions = null;
    try {
      // Get the last 25 hourly values for ML inference
      const getLastNHours = (pollutantArray: number[], times: string[], n: number = 25) => {
        const totalLength = Math.min(pollutantArray.length, times.length);
        const startIndex = Math.max(0, totalLength - n);
        return {
          values: pollutantArray.slice(startIndex),
          times: times.slice(startIndex)
        };
      };

      const allHistoricalTimes = historicalData.hourly?.time || [];
      const pm25Last25 = getLastNHours(historicalData.hourly?.pm2_5 || [], allHistoricalTimes);
      const pm10Last25 = getLastNHours(historicalData.hourly?.pm10 || [], allHistoricalTimes);
      const co2Last25 = getLastNHours(historicalData.hourly?.carbon_dioxide || [], allHistoricalTimes);
      const so2Last25 = getLastNHours(historicalData.hourly?.sulphur_dioxide || [], allHistoricalTimes);

      // Prepare ML inference request body
      const inferenceRequestBody = {
        city: "chicago", // You might want to add city detection based on lat/lng
        historical_data: {
          hourly__time: pm25Last25.times,
          hourly__pm2_5: pm25Last25.values,
          hourly__pm10: pm10Last25.values,
          hourly__carbon_dioxide: co2Last25.values,
          hourly__sulphur_dioxide: so2Last25.values
        }
      };

      // Call ML inference endpoint
      const inferenceResponse = await fetch(`${req.nextUrl.origin}/api/inference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inferenceRequestBody)
      });

      if (inferenceResponse.ok) {
        mlPredictions = await inferenceResponse.json();
        console.log(mlPredictions)
        console.log("ML predictions obtained successfully");
      } else {
        console.warn("ML inference failed, continuing without predictions");
      }
    } catch (error) {
      console.warn("Error getting ML predictions:", error);
      // Continue without ML predictions
    }
    
    // Parse ML predictions if available
    let jsonMLPredictions = null;
    if (mlPredictions) {
      try {
        jsonMLPredictions = typeof mlPredictions === 'string' ? JSON.parse(mlPredictions) : mlPredictions;
      } catch (parseError) {
        console.warn("Failed to parse ML predictions:", parseError);
        jsonMLPredictions = null;
      }
    }

    // Use ML predictions as primary forecast data if available, otherwise fallback to Open-Meteo forecasts
    const getForecastData = (openMeteoForecast: { values: number[], times: string[] }, pollutantKey: string) => {
      if (jsonMLPredictions && jsonMLPredictions.predictions && jsonMLPredictions.predictions[pollutantKey]) {
        const mlPollutantData = jsonMLPredictions.predictions[pollutantKey];
        const mlForecasts = mlPollutantData.forecasts;

        console.log(`🔍 ML prediction data for ${pollutantKey}:`, mlPollutantData);

        // Extract predicted values and timestamps from the forecasts array
        if (Array.isArray(mlForecasts) && mlForecasts.length > 0) {
          const valuesArray = mlForecasts.map(forecast => forecast.predicted_value);
          const timesArray = mlForecasts.map(forecast => forecast.timestamp);

          // Ensure we have the same number of time points as expected (6 hours)
          const forecastLength = Math.min(6, valuesArray.length, timesArray.length);
          
          console.log(`✅ Using ML prediction for ${pollutantKey}: ${valuesArray.length} forecast values available, using ${forecastLength}`);
          console.log(`📊 ML forecast values for ${pollutantKey}:`, valuesArray.slice(0, forecastLength));
          
          return {
            values: valuesArray.slice(0, forecastLength),
            times: timesArray.slice(0, forecastLength)
          };
        } else {
          console.warn(`⚠️ ML forecasts array empty or invalid for ${pollutantKey}:`, mlForecasts);
          return openMeteoForecast;
        }
      }
      
      // Fallback to Open-Meteo forecast
      console.log(`⚠️ Falling back to Open-Meteo forecast for ${pollutantKey}: ML predictions not available`);
      return openMeteoForecast;
    };

    // Log overall ML prediction availability
    if (jsonMLPredictions) {
      console.log("City from ML predictions:", jsonMLPredictions.city);
      console.log("🚀 ML Predictions Available - Using Azure ML forecasts where possible");
      console.log("Available ML pollutants:", Object.keys(jsonMLPredictions.predictions || {}));
    } else {
      console.log("📊 Using Open-Meteo forecasts - ML predictions unavailable");
    }

    // Apply ML predictions to forecast data where available
    const pm25ForecastFinal = getForecastData(pm25Forecast6, "pm2_5");
    const pm10ForecastFinal = getForecastData(pm10Forecast6, "pm10");
    const no2ForecastFinal = getForecastData(no2Forecast6, "nitrogen_dioxide");
    const o3ForecastFinal = getForecastData(o3Forecast6, "ozone");
    const coForecastFinal = getForecastData(coForecast6, "carbon_monoxide");
    const co2ForecastFinal = getForecastData(co2Forecast6, "carbon_dioxide");
    const so2ForecastFinal = getForecastData(so2Forecast6, "sulphur_dioxide");

    // Format the data for frontend dashboard usage
    const formattedData = {
      location: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      },
      timezone: historicalData.timezone || "UTC",
      units: {
        pm2_5: "μg/m³",
        pm10: "μg/m³",
        carbon_monoxide: "μg/m³",
        carbon_dioxide: "μg/m³",
        sulphur_dioxide: "μg/m³",
        nitrogen_dioxide: "μg/m³",
        ozone: "μg/m³",
      },
      current: {
        pm2_5: pm25Data.current,
        pm10: pm10Data.current,
        nitrogen_dioxide: no2Data.current,
        ozone: o3Data.current,
        carbon_monoxide: coData.current,
      },
      changes: {
        pm2_5: pm25Data.change,
        pm10: pm10Data.change,
        nitrogen_dioxide: no2Data.change,
        ozone: o3Data.change,
        carbon_monoxide: coData.change,
      },
      hourly: {
        historical: {
          time: pm25Last6.times, // Last 6 hours times
          pollutants: {
            pm2_5: pm25Last6.values,
            pm10: pm10Last6.values,
            carbon_monoxide: coLast6.values,
            carbon_dioxide: co2Last6.values,
            sulphur_dioxide: so2Last6.values,
            nitrogen_dioxide: no2Last6.values,
            ozone: o3Last6.values,
          },
        },
        forecast: {
          time: pm25ForecastFinal.times, // Next 6 hours times (ML or Open-Meteo)
          pollutants: {
            pm2_5: pm25ForecastFinal.values,
            pm10: pm10ForecastFinal.values,
            carbon_monoxide: coForecastFinal.values,
            carbon_dioxide: co2ForecastFinal.values,
            sulphur_dioxide: so2ForecastFinal.values,
            nitrogen_dioxide: no2ForecastFinal.values,
            ozone: o3ForecastFinal.values,
          },
        },
      },
      summary: {
        total_readings: pm25Last6.times.length,
        forecast_readings: pm25ForecastFinal.times.length,
        last_updated: new Date().toISOString(),
        data_range: `Last 6 hours (${pm25Last6.times.length} readings) + Next 6 hours forecast (${pm25ForecastFinal.times.length} readings)`,
        forecast_source: mlPredictions ? "Azure ML" : "Open-Meteo",
      },
      ml_predictions: mlPredictions,
    };

    // Log final forecast summary
    const forecastSource = mlPredictions ? "Azure ML" : "Open-Meteo";
    console.log(`📈 Final forecast data prepared using: ${forecastSource}`);
    console.log(`📊 Response includes ${formattedData.hourly.historical.time.length} historical + ${formattedData.hourly.forecast.time.length} forecast data points`);

    return NextResponse.json(formattedData);
  } catch (error) {
    console.error("Air quality API error:", error);
    return NextResponse.json({ error: "Internal server error while fetching air quality data" }, { status: 500 });
  }
}
