import pandas as pd
import os
import json
import logging
from dataclasses import dataclass
from typing import List
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class AirQualitySchema:
    """Schema definition for air quality data"""
    columns = [
        'hourly__time',
        'hourly__pm2_5',
        'hourly__carbon_monoxide',
        'hourly__sulphur_dioxide',
        'hourly__pm10',
        'hourly__carbon_dioxide'
    ]
    
    dtypes = {
        'hourly__time': 'datetime64[ns]',
        'hourly__pm2_5': 'float64',
        'hourly__carbon_monoxide': 'float64',
        'hourly__sulphur_dioxide': 'float64',
        'hourly__pm10': 'float64',
        'hourly__carbon_dioxide': 'float64'
    }
    
    @staticmethod
    def validate(df: pd.DataFrame) -> bool:
        """Validate dataframe against schema"""
        # Check columns
        if not all(col in df.columns for col in AirQualitySchema.columns):
            missing = set(AirQualitySchema.columns) - set(df.columns)
            logger.error(f"Missing columns: {missing}")
            return False
        
        # Check for null values
        null_counts = df[AirQualitySchema.columns].isnull().sum()
        if null_counts.any():
            logger.error(f"Found null values:\n{null_counts[null_counts > 0]}")
            return False
        
        return True

# Ensure output directory exists
os.makedirs("final_data", exist_ok=True)

def process_json_to_csv(json_file, output_file):
    """Convert JSON to properly formatted CSV with schema validation"""
    try:
        # Load JSON
        with open(json_file, 'r') as f:
            data = json.load(f)
        
        # Extract hourly data
        df = pd.DataFrame({
            'hourly__time': pd.to_datetime(data['hourly']['time']),  # Convert to datetime
            'hourly__pm2_5': pd.to_numeric(data['hourly']['pm2_5'], errors='coerce'),
            'hourly__carbon_monoxide': pd.to_numeric(data['hourly']['carbon_monoxide'], errors='coerce'),
            'hourly__sulphur_dioxide': pd.to_numeric(data['hourly']['sulphur_dioxide'], errors='coerce'),
            'hourly__pm10': pd.to_numeric(data['hourly']['pm10'], errors='coerce'),
            'hourly__carbon_dioxide': pd.to_numeric(data['hourly']['carbon_dioxide'], errors='coerce')
        })
        
        # Drop rows with any null values
        original_len = len(df)
        df = df.dropna()
        dropped_rows = original_len - len(df)
        if dropped_rows > 0:
            logger.warning(f"Dropped {dropped_rows} rows containing null values")
        
        # Convert types according to schema
        for col, dtype in AirQualitySchema.dtypes.items():
            if col != 'hourly__time':  # Skip datetime as it's already converted
                df[col] = df[col].astype(dtype)
        
        # Validate against schema
        if not AirQualitySchema.validate(df):
            raise ValueError("Data validation failed")
        
        # Save to CSV with schema columns
        df[AirQualitySchema.columns].to_csv(output_file, index=False)
        logger.info(f"Successfully processed {json_file}")
        
        # Log data summary
        logger.info(f"Data summary for {json_file}:")
        logger.info(f"Records: {len(df)}")
        logger.info(f"Date range: {df['hourly__time'].min()} to {df['hourly__time'].max()}")
        
    except Exception as e:
        logger.error(f"Error processing {json_file}: {str(e)}")
        raise

# Process each city
for city in ["chicago", "losangeles", "sanfrancisco", "seattle"]:
    json_file = f"JSONs/{city}.json"
    output_file = f"final_data/{city}.csv"
    process_json_to_csv(json_file, output_file)