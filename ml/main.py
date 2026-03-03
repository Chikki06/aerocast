#!/usr/bin/env python3
"""
TEMPO Air Quality Data Training - Fixed City Filtering
Properly filters data to city boundaries and integrates weather data
"""

import os
from datetime import datetime, timedelta
import numpy as np
import pandas as pd
import xarray as xr
import earthaccess
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error, r2_score
import pickle
import sys
import warnings

print(f"Python version: {sys.version}")

# Try to import GPU libraries
try:
    import cudf
    import cuml
    from cuml.ensemble import RandomForestRegressor as cuRF
    import numba.cuda
    
    CUDA_VERSION = numba.cuda.runtime.get_version()
    print(f"CUDA version: {CUDA_VERSION[0]}.{CUDA_VERSION[1]}")
    
    if CUDA_VERSION[0] >= 12:
        import cudf.pandas
        GPU_AVAILABLE = True
        print("GPU libraries (RAPIDS) detected - will use GPU acceleration")
        print(f"RAPIDS cuDF version: {cudf.__version__}")
        print(f"RAPIDS cuML version: {cuml.__version__}")
        from cuml.preprocessing import StandardScaler as cuStandardScaler
    else:
        raise ImportError("CUDA version not compatible")
        
except ImportError as e:
    print(f"GPU libraries not available: {str(e)}")
    print("Using CPU (sklearn) instead")
    from sklearn.ensemble import RandomForestRegressor
    GPU_AVAILABLE = False

# Configuration
POLLUTANTS = {
    'NO2': {
        'collection_id': 'C2930725014-LARC_CLOUD',
        'short_name': 'TEMPO_NO2_L3',
        'var_names': ['vertical_column_troposphere', 'tropospheric_NO2_column_number_density', 
                      'NO2', 'nitrogen_dioxide_tropospheric_column']
    },
    'O3': {
        'collection_id': 'C2930725015-LARC_CLOUD',
        'short_name': 'TEMPO_O3TOT_L3',
        'var_names': ['vertical_column_troposphere', 'O3', 'ozone_column']
    },
    'HCHO': {
        'collection_id': 'C2930725016-LARC_CLOUD',
        'short_name': 'TEMPO_HCHO_L3',
        'var_names': ['vertical_column_troposphere', 'HCHO', 'formaldehyde_column']
    },
    'AI': {
        'collection_id': 'C2930725017-LARC_CLOUD',
        'short_name': 'TEMPO_AI_L3',
        'var_names': ['aerosol_index', 'AI']
    },
    'PM': {
        'collection_id': 'C2930725018-LARC_CLOUD',
        'short_name': 'TEMPO_PM_L3',
        'var_names': ['particulate_matter', 'PM25', 'PM']
    }
}

BASE_DOWNLOAD_DIR = "/tmp/tempo_data"
PROCESSED_DATA_DIR = "/mnt/nasa-spaceapps/processed_data"
WEATHER_DATA_DIR = "/mnt/nasa-spaceapps/processed_data"  # Where hourly weather CSVs are

for pollutant in POLLUTANTS:
    os.makedirs(f"{BASE_DOWNLOAD_DIR}/{pollutant.lower()}", exist_ok=True)
os.makedirs(PROCESSED_DATA_DIR, exist_ok=True)

# City configurations with EXACT boundaries
CITY_BBOXES = {
    'seattle': {
        'bbox': (-122.4598, 47.4951, -122.2244, 47.7341),
        'name': 'Seattle, WA',
        'weather_file': 'seattle.csv'
    },
    'sanfrancisco': {
        'bbox': (-122.5155, 37.7034, -122.3549, 37.8324),
        'name': 'San Francisco, CA',
        'weather_file': 'sanfrancisco.csv'
    },
    'losangeles': {
        'bbox': (-118.6682, 33.7037, -118.1553, 34.3373),
        'name': 'Los Angeles, CA',
        'weather_file': 'losangeles.csv'
    },
    'chicago': {
        'bbox': (-87.9401, 41.6445, -87.5241, 42.0230),
        'name': 'Chicago, IL',
        'weather_file': 'chicago.csv'
    }
}


def filter_to_city_bounds(df, city_bbox):
    """
    Filter DataFrame to only include points within city bounding box
    
    Args:
        df: DataFrame with latitude and longitude columns
        city_bbox: Tuple of (min_lon, min_lat, max_lon, max_lat)
    
    Returns:
        Filtered DataFrame
    """
    min_lon, min_lat, max_lon, max_lat = city_bbox
    
    initial_count = len(df)
    
    # Filter by bounding box
    filtered_df = df[
        (df['latitude'] >= min_lat) & 
        (df['latitude'] <= max_lat) &
        (df['longitude'] >= min_lon) & 
        (df['longitude'] <= max_lon)
    ].copy()
    
    final_count = len(filtered_df)
    removed = initial_count - final_count
    
    print(f"  Filtered: {initial_count:,} -> {final_count:,} points ({removed:,} removed)")
    print(f"  Lat range: {filtered_df['latitude'].min():.4f} to {filtered_df['latitude'].max():.4f}")
    print(f"  Lon range: {filtered_df['longitude'].min():.4f} to {filtered_df['longitude'].max():.4f}")
    
    return filtered_df


def load_weather_data(city_key):
    """
    Load hourly weather data for a city
    
    Args:
        city_key: City key (e.g., 'seattle', 'chicago')
    
    Returns:
        DataFrame with weather data indexed by datetime
    """
    weather_file = CITY_BBOXES[city_key]['weather_file']
    weather_path = os.path.join(WEATHER_DATA_DIR, weather_file)
    
    if not os.path.exists(weather_path):
        print(f"  Warning: Weather file not found: {weather_path}")
        return None
    
    print(f"  Loading weather data from {weather_file}...")
    
    # Load weather data
    weather_df = pd.read_csv(weather_path)
    
    # Rename columns to remove 'hourly__' prefix
    weather_df.columns = [col.replace('hourly__', '') for col in weather_df.columns]
    
    # Convert time to datetime
    weather_df['datetime'] = pd.to_datetime(weather_df['time'])
    weather_df = weather_df.drop('time', axis=1)
    
    print(f"  Loaded {len(weather_df)} hourly weather records")
    print(f"  Weather date range: {weather_df['datetime'].min()} to {weather_df['datetime'].max()}")
    print(f"  Weather columns: {list(weather_df.columns)}")
    
    return weather_df


def authenticate_earthaccess():
    """Authenticate with NASA Earthdata"""
    auth = earthaccess.login()
    if auth.authenticated:
        print("Successfully authenticated with NASA Earthdata")
        return True
    else:
        print("Authentication failed")
        return False


def generate_date_range(start_date_str, end_date_str):
    """Generate list of dates between start and end"""
    start_date = datetime.strptime(start_date_str, "%Y%m%d")
    end_date = datetime.strptime(end_date_str, "%Y%m%d")
    
    date_list = []
    current_date = start_date
    while current_date <= end_date:
        date_list.append(current_date.strftime("%Y%m%d"))
        current_date += timedelta(days=1)
    
    return date_list


def search_tempo_data(pollutant_type, date_str, bbox=None):
    """Search for TEMPO data"""
    if pollutant_type not in POLLUTANTS:
        raise ValueError(f"Invalid pollutant type: {pollutant_type}")
        
    pollutant_info = POLLUTANTS[pollutant_type]
    date_obj = datetime.strptime(date_str, "%Y%m%d")
    start_date = date_obj
    end_date = date_obj + timedelta(days=1)
    
    print(f"  Searching for TEMPO {pollutant_type} data on {date_str}")
    
    search_params = {
        "short_name": pollutant_info['short_name'],
        "temporal": (start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"))
    }
    
    if bbox:
        search_params["bounding_box"] = bbox
    
    results = earthaccess.search_data(count=-1, **search_params)
    print(f"  Found {len(results)} granules")
    return results


def download_tempo_data(pollutant_type, granules):
    """Download TEMPO granules"""
    download_dir = f"{BASE_DOWNLOAD_DIR}/{pollutant_type.lower()}"
    print(f"  Downloading {len(granules)} files to {download_dir}")
    
    downloaded_files = earthaccess.download(
        granules,
        download_dir,
        threads=4
    )
    
    print(f"  Successfully downloaded {len(downloaded_files)} files")
    return downloaded_files


def load_and_process_data(pollutant_type, filepaths, city_bbox, subsample_rate=5):
    """
    Load pollutant data and filter to city boundaries
    
    Args:
        pollutant_type: Type of pollutant
        filepaths: List of NetCDF file paths
        city_bbox: Bounding box (min_lon, min_lat, max_lon, max_lat)
        subsample_rate: Spatial subsampling rate
    
    Returns:
        DataFrame filtered to city boundaries
    """
    all_data = []
    
    for filepath in filepaths:
        print(f"  Processing: {os.path.basename(filepath)}")
        
        try:
            ds = xr.open_dataset(filepath)
            
            if pollutant_type not in POLLUTANTS:
                raise ValueError(f"Invalid pollutant type: {pollutant_type}")
                
            pollutant_info = POLLUTANTS[pollutant_type]
            
            # Find pollutant variable
            data_var = None
            for var in pollutant_info['var_names']:
                if var in ds.variables:
                    data_var = var
                    break
            
            if data_var is None:
                for var in ds.data_vars:
                    if len(ds[var].dims) >= 2:
                        data_var = var
                        break
            
            if data_var is None:
                print(f"  Could not find {pollutant_type} variable, skipping")
                continue
            
            pollutant_data = ds[data_var]
            
            # Get coordinates
            lat = ds.latitude if 'latitude' in ds else ds.lat
            lon = ds.longitude if 'longitude' in ds else ds.lon
            
            # Get time
            if 'time' in ds:
                file_time = pd.to_datetime(ds.time.values[0])
            else:
                filename = os.path.basename(filepath)
                time_str = filename.split('_')[3].replace('T', ' ').replace('.nc', '')
                file_time = pd.to_datetime(time_str, format='%Y%m%d %H%M%S')
            
            # Handle multi-dimensional data
            if len(pollutant_data.dims) == 3:
                pollutant_values = pollutant_data.values[0, :, :]
            else:
                pollutant_values = pollutant_data.values
            
            # Create mesh grid
            lon_mesh, lat_mesh = np.meshgrid(lon.values, lat.values)
            
            # Flatten arrays
            lats_flat = lat_mesh.flatten()
            lons_flat = lon_mesh.flatten()
            pollutant_flat = pollutant_values.flatten()
            
            # Remove NaN values
            valid_mask = ~np.isnan(pollutant_flat)
            
            df_chunk = pd.DataFrame({
                'datetime': file_time,
                'latitude': lats_flat[valid_mask],
                'longitude': lons_flat[valid_mask],
                pollutant_type.lower(): pollutant_flat[valid_mask]
            })
            
            # CRITICAL: Filter to city bounds BEFORE adding to list
            df_chunk = filter_to_city_bounds(df_chunk, city_bbox)
            
            if len(df_chunk) > 0:
                # Apply subsampling after filtering
                if subsample_rate > 1:
                    df_chunk = df_chunk.iloc[::subsample_rate]
                    print(f"  After subsampling (1/{subsample_rate}): {len(df_chunk)} points")
                
                all_data.append(df_chunk)
            
            ds.close()
            
        except Exception as e:
            print(f"  Error processing {filepath}: {str(e)}")
            continue
    
    if not all_data:
        raise ValueError("No data was successfully processed")
    
    # Combine all data
    df = pd.concat(all_data, ignore_index=True)
    print(f"\n  Total data points for city: {len(df):,}")
    
    return df


def merge_weather_data(df, weather_df, city_key):
    """
    Merge pollutant data with hourly weather data
    
    Args:
        df: Pollutant DataFrame with datetime column
        weather_df: Weather DataFrame with datetime and weather columns
        city_key: City identifier
    
    Returns:
        Merged DataFrame
    """
    if weather_df is None:
        print(f"  No weather data available for {city_key}")
        return df
    
    print(f"\n  Merging weather data...")
    print(f"  Pollutant data: {len(df)} rows")
    
    # Round pollutant datetime to nearest hour for matching
    df['datetime_hour'] = df['datetime'].dt.floor('H')
    
    # Merge on hourly datetime
    merged_df = pd.merge(
        df,
        weather_df,
        left_on='datetime_hour',
        right_on='datetime',
        how='left',
        suffixes=('', '_weather')
    )
    
    # Drop duplicate datetime columns
    merged_df = merged_df.drop(['datetime_hour', 'datetime_weather'], axis=1, errors='ignore')
    
    # Check merge success
    weather_cols = [col for col in weather_df.columns if col != 'datetime']
    missing_weather = merged_df[weather_cols].isna().sum().sum()
    
    print(f"  After merge: {len(merged_df)} rows")
    print(f"  Weather columns added: {weather_cols}")
    print(f"  Missing weather values: {missing_weather}")
    
    return merged_df


def create_lagged_features(df, pollutant_col, max_lag_days=4, use_gpu=False):
    """Create lagged features for time series prediction"""
    if use_gpu and GPU_AVAILABLE:
        df = df.copy()
    else:
        df = df.copy()
        
    df = df.sort_values(['latitude', 'longitude', 'datetime'])
    
    # Create location key
    df['location_key'] = df['latitude'].round(4).astype(str) + '_' + df['longitude'].round(4).astype(str)
    
    # Create lagged features
    for lag_days in range(1, max_lag_days + 1):
        lag_hours = lag_days * 24
        col_name = f'{pollutant_col}_lag_{lag_days}d'
        df[col_name] = df.groupby('location_key')[pollutant_col].shift(lag_hours)
    
    # Rolling statistics
    df[f'{pollutant_col}_rolling_mean_3d'] = df.groupby('location_key')[pollutant_col].transform(
        lambda x: x.rolling(window=72, min_periods=1).mean()
    )
    
    df[f'{pollutant_col}_rolling_std_3d'] = df.groupby('location_key')[pollutant_col].transform(
        lambda x: x.rolling(window=72, min_periods=1).std()
    )
    
    # Drop rows with insufficient lag data
    initial_rows = len(df)
    df = df.dropna(subset=[f'{pollutant_col}_lag_{i}d' for i in range(1, max_lag_days + 1)])
    print(f"  Dropped {initial_rows - len(df)} rows due to insufficient lag data")
    
    df = df.drop('location_key', axis=1)
    
    return df


def engineer_features(df, pollutant_col, include_lags=True, use_gpu=False):
    """Create features for the model"""
    if use_gpu and GPU_AVAILABLE:
        df = df.copy()
        df['year'] = df['datetime'].dt.year
        df['month'] = df['datetime'].dt.month
        df['day'] = df['datetime'].dt.day
        df['hour'] = df['datetime'].dt.hour
        df['dayofweek'] = df['datetime'].dt.dayofweek
        df['dayofyear'] = df['datetime'].dt.dayofyear
    else:
        df = df.copy()
        df['year'] = df['datetime'].dt.year
        df['month'] = df['datetime'].dt.month
        df['day'] = df['datetime'].dt.day
        df['hour'] = df['datetime'].dt.hour
        df['dayofweek'] = df['datetime'].dt.dayofweek
        df['dayofyear'] = df['datetime'].dt.dayofyear
    
    # Cyclical encoding
    if use_gpu and GPU_AVAILABLE:
        import cupy as cp
        df['hour_sin'] = cp.sin(2 * cp.pi * df['hour'] / 24)
        df['hour_cos'] = cp.cos(2 * cp.pi * df['hour'] / 24)
        df['month_sin'] = cp.sin(2 * cp.pi * df['month'] / 12)
        df['month_cos'] = cp.cos(2 * cp.pi * df['month'] / 12)
        df['dayofweek_sin'] = cp.sin(2 * cp.pi * df['dayofweek'] / 7)
        df['dayofweek_cos'] = cp.cos(2 * cp.pi * df['dayofweek'] / 7)
    else:
        df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
        df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
        df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
        df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
        df['dayofweek_sin'] = np.sin(2 * np.pi * df['dayofweek'] / 7)
        df['dayofweek_cos'] = np.cos(2 * np.pi * df['dayofweek'] / 7)
    
    # Add lagged features
    if include_lags:
        df = create_lagged_features(df, pollutant_col, max_lag_days=4, use_gpu=use_gpu)
    
    return df


def train_model(pollutant_type, df, city_key, test_size=0.2, random_state=42, use_gpu=False):
    """
    Train model with weather features included
    """
    pollutant_col = pollutant_type.lower()
    
    print(f"\n{'='*60}")
    print(f"Training model for {CITY_BBOXES[city_key]['name']} - {pollutant_type}")
    print(f"{'='*60}")
    
    # Convert to GPU if needed
    if use_gpu and GPU_AVAILABLE:
        try:
            if not isinstance(df, cudf.DataFrame):
                print("Converting to GPU memory...")
                df = cudf.DataFrame.from_pandas(df)
        except Exception as e:
            print(f"GPU conversion failed: {e}, using CPU")
            use_gpu = False
    
    # Engineer features
    print("Engineering features...")
    df = engineer_features(df, pollutant_col, include_lags=True, use_gpu=use_gpu)
    
    # Select features
    feature_cols = [
        'latitude', 'longitude',
        'hour', 'day', 'month', 'dayofweek', 'dayofyear',
        'hour_sin', 'hour_cos', 'month_sin', 'month_cos',
        'dayofweek_sin', 'dayofweek_cos'
    ]
    
    # Add weather features if available
    weather_feature_cols = ['pm2_5', 'carbon_monoxide', 'sulphur_dioxide', 'pm10', 'carbon_dioxide']
    available_weather = [col for col in weather_feature_cols if col in df.columns]
    
    if available_weather:
        print(f"Including weather features: {available_weather}")
        feature_cols.extend(available_weather)
    
    # Add lagged features
    lag_features = [f'{pollutant_col}_lag_{i}d' for i in range(1, 5)]
    feature_cols.extend(lag_features)
    feature_cols.extend([f'{pollutant_col}_rolling_mean_3d', f'{pollutant_col}_rolling_std_3d'])
    
    print(f"Total features: {len(feature_cols)}")
    
    X = df[feature_cols]
    y = df[pollutant_col]
    
    # Temporal split
    df_sorted = df.sort_values('datetime')
    split_idx = int(len(df_sorted) * (1 - test_size))
    
    train_data = df_sorted.iloc[:split_idx]
    test_data = df_sorted.iloc[split_idx:]
    
    X_train = train_data[feature_cols]
    y_train = train_data[pollutant_col]
    X_test = test_data[feature_cols]
    y_test = test_data[pollutant_col]
    
    print(f"\nTraining set: {len(X_train):,} samples")
    print(f"Test set: {len(X_test):,} samples")
    
    # Scale features
    if use_gpu and GPU_AVAILABLE:
        from cuml.preprocessing import StandardScaler as cuStandardScaler
        scaler = cuStandardScaler()
    else:
        scaler = StandardScaler()
    
    print("Scaling features...")
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Initialize model
    print(f"\nTraining Random Forest on {'GPU' if use_gpu and GPU_AVAILABLE else 'CPU'}...")
    
    if use_gpu and GPU_AVAILABLE:
        model = cuRF(
            n_estimators=100,
            max_depth=20,
            min_samples_split=5,
            min_samples_leaf=2,
            random_state=random_state,
            n_bins=128,
            split_criterion=2,
            max_samples=0.8
        )
    else:
        model = RandomForestRegressor(
            n_estimators=50,
            max_depth=15,
            min_samples_split=5,
            min_samples_leaf=2,
            max_samples=0.5,
            random_state=random_state,
            n_jobs=-1,
            verbose=1
        )
    
    model.fit(X_train_scaled, y_train)
    
    # Evaluate
    print("Evaluating model...")
    y_pred_train = model.predict(X_train_scaled)
    y_pred_test = model.predict(X_test_scaled)
    
    # Convert to numpy if GPU
    if use_gpu and GPU_AVAILABLE:
        y_train = y_train.to_numpy()
        y_test = y_test.to_numpy()
        y_pred_train = y_pred_train.to_numpy()
        y_pred_test = y_pred_test.to_numpy()
    
    metrics = {
        'train_rmse': np.sqrt(mean_squared_error(y_train, y_pred_train)),
        'test_rmse': np.sqrt(mean_squared_error(y_test, y_pred_test)),
        'train_r2': r2_score(y_train, y_pred_train),
        'test_r2': r2_score(y_test, y_pred_test)
    }
    
    print("\n=== Model Performance ===")
    print(f"Train RMSE: {metrics['train_rmse']:.6f}")
    print(f"Test RMSE:  {metrics['test_rmse']:.6f}")
    print(f"Train R²:   {metrics['train_r2']:.4f}")
    print(f"Test R²:    {metrics['test_r2']:.4f}")
    
    return model, scaler, metrics, feature_cols


def save_model(model, scaler, feature_cols, pollutant_type, city_key, use_gpu=False):
    """Save model with city identifier"""
    filepath = f"{city_key}_{pollutant_type.lower()}_model.pkl"
    
    model_package = {
        'model': model,
        'scaler': scaler,
        'feature_cols': feature_cols,
        'pollutant_type': pollutant_type,
        'city_key': city_key,
        'gpu_trained': use_gpu and GPU_AVAILABLE
    }
    
    with open(filepath, 'wb') as f:
        pickle.dump(model_package, f)
    
    print(f"\nModel saved to {filepath}")


# Main execution
if __name__ == "__main__":
    # Configuration
    start_date = "20250901"
    end_date = "20250916"
    
    USE_GPU = GPU_AVAILABLE
    SUBSAMPLE_RATE = 3  # Less aggressive subsampling since we're filtering
    
    print("=" * 60)
    print("TEMPO Air Quality Training - Fixed City Filtering")
    print(f"GPU: {'ENABLED' if USE_GPU else 'DISABLED'}")
    print(f"Spatial Subsampling: 1/{SUBSAMPLE_RATE}")
    print("=" * 60)
    
    # Authenticate
    print("\nAuthenticating with NASA Earthdata...")
    if not authenticate_earthaccess():
        print("\nAuthentication required.")
        exit(1)
    
    # Process each city
    for city_key, city_info in CITY_BBOXES.items():
        city_name = city_info['name']
        city_bbox = city_info['bbox']
        
        print(f"\n{'=' * 70}")
        print(f"Processing: {city_name}")
        print(f"Bounds: Lon[{city_bbox[0]:.4f}, {city_bbox[2]:.4f}] "
              f"Lat[{city_bbox[1]:.4f}, {city_bbox[3]:.4f}]")
        print("=" * 70)
        
        # Load weather data for this city
        weather_df = load_weather_data(city_key)
        
        # Process each pollutant
        for pollutant_type in ['HCHO']:  # Start with HCHO as in your example
            print(f"\n{'='*60}")
            print(f"Processing {pollutant_type} for {city_name}")
            print("=" * 60)
            
            date_list = generate_date_range(start_date, end_date)
            print(f"Date range: {start_date} to {end_date} ({len(date_list)} days)")
            
            all_files = []
            
            # Download data
            for date in date_list:
                print(f"\n--- {date} ---")
                
                try:
                    granules = search_tempo_data(pollutant_type, date, bbox=city_bbox)
                    
                    if not granules:
                        print(f"  No granules found")
                        continue
                    
                    downloaded_files = download_tempo_data(pollutant_type, granules)
                    all_files.extend(downloaded_files)
                    
                except Exception as e:
                    print(f"  Error: {str(e)}")
                    continue
            
            if not all_files:
                print(f"No data downloaded for {city_name} {pollutant_type}")
                continue
            
            # Load and process with city filtering
            try:
                print(f"\nLoading and filtering data to {city_name} boundaries...")
                df = load_and_process_data(
                    pollutant_type, 
                    all_files, 
                    city_bbox,  # Pass bbox for filtering
                    subsample_rate=SUBSAMPLE_RATE
                )
                
                # Merge with weather data
                if weather_df is not None:
                    df = merge_weather_data(df, weather_df, city_key)
                
                # Save filtered data
                save_path = f"{PROCESSED_DATA_DIR}/{city_key}_{pollutant_type.lower()}_filtered.csv"
                df.to_csv(save_path, index=False)
                print(f"\nFiltered data saved to {save_path}")
                
                # Train model
                model, scaler, metrics, feature_cols = train_model(
                    pollutant_type, df, city_key, use_gpu=USE_GPU
                )
                
                # Save model
                save_model(model, scaler, feature_cols, pollutant_type, city_key, use_gpu=USE_GPU)
                
            except Exception as e:
                print(f"Error processing {city_name} {pollutant_type}: {str(e)}")
                continue