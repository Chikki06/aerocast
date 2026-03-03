import json
import joblib
import numpy as np
import pandas as pd
import os
from datetime import datetime

# Configuration
TARGET_COLS = ['hourly__pm2_5', 'hourly__sulphur_dioxide', 
               'hourly__pm10', 'hourly__carbon_dioxide']
FORECAST_HORIZON = 6
LAG_FEATURES = [1, 2, 3, 6, 12, 24]
ROLLING_WINDOWS = [3, 6, 12, 24]

# Global variables for models and preprocessing objects
models = None
scaler = None
feature_cols = None


def init():
    """
    Initialize models and preprocessing objects from Azure ML model directory
    This function is called once when the container starts
    """
    global models, scaler, feature_cols
    
    try:
        model_dir = os.getenv("AZUREML_MODEL_DIR")
        
        # Load all required objects
        models_path = os.path.join(model_dir, "models" , "xgboost_models.pkl")
        scaler_path = os.path.join(model_dir, "models" , "scaler.pkl")
        feature_cols_path = os.path.join(model_dir, "models" , "feature_cols.pkl")

        models = joblib.load(models_path)
        scaler = joblib.load(scaler_path)
        feature_cols = joblib.load(feature_cols_path)
        
        print(f"Successfully loaded {len(models)} models")
        print(f"Expected features: {len(feature_cols)}")
        
    except Exception as e:
        print(f"Error in init(): {str(e)}")
        raise


def create_time_features(df):
    """Extract time-based features"""
    df['hour'] = df['hourly__time'].dt.hour
    df['day_of_week'] = df['hourly__time'].dt.dayofweek
    df['day_of_month'] = df['hourly__time'].dt.day
    df['month'] = df['hourly__time'].dt.month
    df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
    
    # Cyclical encoding
    df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
    df['dow_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
    df['dow_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
    
    # Time categories
    df['hour_category'] = pd.cut(df['hour'], 
                                 bins=[0, 6, 12, 18, 24],
                                 labels=['night', 'morning', 'afternoon', 'evening'],
                                 include_lowest=True)
    return df


def create_lag_features(df, target_cols, lag_periods):
    """Create lagged features"""
    for col in target_cols:
        for lag in lag_periods:
            df[f'{col}_lag_{lag}'] = df[col].shift(lag)
    return df


def create_rolling_features(df, target_cols, windows):
    """Create rolling statistics with proper shift"""
    for col in target_cols:
        for window in windows:
            df[f'{col}_rolling_mean_{window}'] = df[col].rolling(
                window=window, min_periods=1).mean().shift(1)
            df[f'{col}_rolling_std_{window}'] = df[col].rolling(
                window=window, min_periods=1).std().shift(1)
            df[f'{col}_rolling_max_{window}'] = df[col].rolling(
                window=window, min_periods=1).max().shift(1)
            df[f'{col}_rolling_min_{window}'] = df[col].rolling(
                window=window, min_periods=1).min().shift(1)
    return df


def create_advanced_features(df, target_cols):
    """Create advanced features"""
    # Rate of change
    for col in target_cols:
        df[f'{col}_diff_1h'] = df[col].diff(1)
        df[f'{col}_diff_3h'] = df[col].diff(3)
        df[f'{col}_pct_change_1h'] = df[col].pct_change(1)
    
    # Temperature interactions
    if 'hourly__temperature_2m' in df.columns:
        df['temp_pm2_5_interaction'] = df['hourly__temperature_2m'] * df['hourly__pm2_5']
        df['temp_pm10_interaction'] = df['hourly__temperature_2m'] * df['hourly__pm10']
        df['temp_category'] = pd.cut(df['hourly__temperature_2m'], 
                                     bins=[-np.inf, 10, 20, 30, np.inf],
                                     labels=[0, 1, 2, 3])
    
    # Wind interactions
    if 'hourly__wind_speed_10m' in df.columns:
        for col in ['hourly__pm2_5', 'hourly__pm10']:
            if col in df.columns:
                df[f'wind_{col.split("__")[1]}_interaction'] = df['hourly__wind_speed_10m'] * df[col]
    
    return df


def create_interaction_features(df, target_cols):
    """Create interaction features"""
    df['pm_ratio'] = df['hourly__pm2_5'] / (df['hourly__pm10'] + 1e-6)
    df['pollution_index'] = (df['hourly__pm2_5'] + df['hourly__pm10'] + df['hourly__sulphur_dioxide'])
    return df


def prepare_features(df):
    """Create all features for inference"""
    df = create_time_features(df)
    df = create_lag_features(df, TARGET_COLS, LAG_FEATURES)
    df = create_rolling_features(df, TARGET_COLS, ROLLING_WINDOWS)
    df = create_advanced_features(df, TARGET_COLS)
    df = create_interaction_features(df, TARGET_COLS)
    return df


def run(raw_data):
    """
    Process incoming request and return predictions
    
    Expected JSON input format:
    {
        "city": "chicago",
        "historical_data": {
            "hourly__time": ["2024-01-01T00:00:00", ...],
            "hourly__pm2_5": [25.5, 26.1, ...],
            "hourly__pm10": [40.2, 41.0, ...],
            "hourly__carbon_dioxide": [410.5, 411.0, ...],
            "hourly__sulphur_dioxide": [5.1, 5.3, ...]
        }
    }
    
    Returns:
    {
        "city": "chicago",
        "prediction_base_time": "2024-01-02T00:00:00",
        "predictions": {
            "pm2_5": {
                "current_value": 25.4,
                "forecasts": [
                    {"horizon": 1, "predicted_value": 25.8, "timestamp": "2024-01-02T01:00:00"},
                    ...
                ]
            },
            ...
        }
    }
    """
    try:
        # Parse input JSON
        data = json.loads(raw_data)
        
        # Validate required fields
        if 'city' not in data or 'historical_data' not in data:
            return json.dumps({
                "error": "Missing required fields: 'city' and 'historical_data'"
            })
        
        city = data['city']
        hist_data = data['historical_data']
        
        # Convert to DataFrame
        df = pd.DataFrame(hist_data)
        df['hourly__time'] = pd.to_datetime(df['hourly__time'])
        df = df.sort_values('hourly__time').reset_index(drop=True)
        df['city'] = city
        
        # Validate minimum data points
        if len(df) < 25:
            return json.dumps({
                "error": f"Insufficient historical data. Need at least 25 hours, got {len(df)}"
            })
        
        # Create features
        df_featured = prepare_features(df.copy())
        
        # One-hot encode city and hour_category
        df_featured = pd.get_dummies(df_featured, 
                                     columns=['city', 'hour_category'], 
                                     prefix=['city', 'hour_cat'])
        
        # Get last row (most recent timestamp) for prediction
        last_row = df_featured.iloc[[-1]].copy()
        
        # Ensure all expected features exist
        for col in feature_cols:
            if col not in last_row.columns:
                last_row[col] = 0
        
        # Select and order features to match training
        X = last_row[feature_cols]
        
        # Handle missing values
        if X.isna().any().any():
            X = X.fillna(0)
        
        # Scale features
        X_scaled = scaler.transform(X)
        X_scaled = pd.DataFrame(X_scaled, columns=feature_cols, index=X.index)
        
        # Make predictions for all horizons and pollutants
        predictions = {}
        latest_timestamp = df['hourly__time'].max()
        
        for pollutant in TARGET_COLS:
            pollutant_name = pollutant.split('__')[1]
            predictions[pollutant_name] = {
                'current_value': float(df[pollutant].iloc[-1]),
                'forecasts': []
            }
            
            for h in range(1, FORECAST_HORIZON + 1):
                target = f'{pollutant}_t+{h}'
                if target in models:
                    pred_value = models[target].predict(X_scaled)[0]
                    predictions[pollutant_name]['forecasts'].append({
                        'horizon': h,
                        'predicted_value': float(pred_value),
                        'timestamp': (latest_timestamp + pd.Timedelta(hours=h)).isoformat()
                    })
        
        # Return predictions
        result = {
            'city': city,
            'prediction_base_time': latest_timestamp.isoformat(),
            'predictions': predictions
        }
        
        return json.dumps(result)
        
    except Exception as e:
        error_response = {
            "error": str(e),
            "error_type": type(e).__name__
        }
        return json.dumps(error_response)