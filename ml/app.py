from flask import Flask, request, jsonify
import pandas as pd
from Azurefiles.inference import AirQualityPredictor
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Initialize predictor
predictor = AirQualityPredictor(
    model_path='models/xgboost_models.pkl',
    scaler_path='models/scaler.pkl',
    feature_cols_path='models/feature_cols.pkl'
)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy", "service": "airquality-forecaster"})

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()
        
        # Extract inputs
        city = data.get('city')
        historical_data = pd.DataFrame(data.get('historical_data'))
        
        if city not in ['chicago', 'losangeles', 'sanfrancisco', 'seattle']:
            return jsonify({"error": "Invalid city"}), 400
        
        # Make prediction
        predictions = predictor.predict(historical_data, city)
        
        # Format response
        response = {
            "city": city,
            "forecast_timestamp": historical_data['hourly__time'].iloc[-1],
            "predictions": {}
        }
        
        for pollutant, data in predictions.items():
            response["predictions"][pollutant] = {
                "values": [float(v) for v in data['values']],
                "timestamps": [str(t) for t in data['timestamps']],
                "units": data['units']
            }
        
        return jsonify(response)
    
    except Exception as e:
        logging.error(f"Prediction error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/predict/batch', methods=['POST'])
def predict_batch():
    try:
        data = request.get_json()
        historical_data_dict = {}
        
        for city, city_data in data.items():
            historical_data_dict[city] = pd.DataFrame(city_data)
        
        predictions = predictor.predict_batch(historical_data_dict)
        
        # Format response
        response = {}
        for city, preds in predictions.items():
            response[city] = {}
            for pollutant, pred_data in preds.items():
                response[city][pollutant] = {
                    "values": [float(v) for v in pred_data['values']],
                    "timestamps": [str(t) for t in pred_data['timestamps']],
                    "units": pred_data['units']
                }
        
        return jsonify(response)
    
    except Exception as e:
        logging.error(f"Batch prediction error: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)