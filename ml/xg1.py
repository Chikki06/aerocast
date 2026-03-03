import pandas as pd
import numpy as np
from xgboost import XGBRegressor
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import joblib
import warnings
import matplotlib.pyplot as plt
import seaborn as sns
from scipy import stats
warnings.filterwarnings('ignore')

# Configuration
CITIES = ['chicago', 'losangeles', 'sanfrancisco', 'seattle']
TARGET_COLS = ['hourly__pm2_5', 'hourly__sulphur_dioxide', 
               'hourly__pm10', 'hourly__carbon_dioxide']
FORECAST_HORIZON = 6  # hours
LAG_FEATURES = [1, 2, 3, 6, 12, 24]  # lag hours
ROLLING_WINDOWS = [3, 6, 12, 24]  # rolling window sizes

def load_and_prepare_data(cities):
    """Load data from all cities and combine"""
    dfs = []
    for city in cities:
        df = pd.read_csv(f'final_data/{city}.csv')
        df['city'] = city
        dfs.append(df)
    
    combined_df = pd.concat(dfs, ignore_index=True)
    combined_df['hourly__time'] = pd.to_datetime(combined_df['hourly__time'])
    combined_df = combined_df.sort_values(['city', 'hourly__time']).reset_index(drop=True)
    
    return combined_df

def create_time_features(df):
    """Extract time-based features"""
    df['hour'] = df['hourly__time'].dt.hour
    df['day_of_week'] = df['hourly__time'].dt.dayofweek
    df['day_of_month'] = df['hourly__time'].dt.day
    df['month'] = df['hourly__time'].dt.month
    df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
    
    # Cyclical encoding for hour
    df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
    
    # Cyclical encoding for day of week
    df['dow_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
    df['dow_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
    
    # Time-based categories
    df['hour_category'] = pd.cut(df['hour'], 
                                 bins=[0, 6, 12, 18, 24],
                                 labels=['night', 'morning', 'afternoon', 'evening'],
                                 include_lowest=True)
    
    return df

def create_lag_features(df, target_cols, lag_periods, city_col='city'):
    """Create lagged features for each city separately"""
    for col in target_cols:
        for lag in lag_periods:
            df[f'{col}_lag_{lag}'] = df.groupby(city_col)[col].shift(lag)
    
    return df

def create_rolling_features(df, target_cols, windows, city_col='city'):
    """Create rolling statistics with proper shift to prevent data leakage"""
    for col in target_cols:
        for window in windows:
            # FIXED: Shift AFTER rolling to prevent data leakage
            df[f'{col}_rolling_mean_{window}'] = df.groupby(city_col)[col].transform(
                lambda x: x.rolling(window=window, min_periods=1).mean().shift(1)
            )
            df[f'{col}_rolling_std_{window}'] = df.groupby(city_col)[col].transform(
                lambda x: x.rolling(window=window, min_periods=1).std().shift(1)
            )
            df[f'{col}_rolling_max_{window}'] = df.groupby(city_col)[col].transform(
                lambda x: x.rolling(window=window, min_periods=1).max().shift(1)
            )
            df[f'{col}_rolling_min_{window}'] = df.groupby(city_col)[col].transform(
                lambda x: x.rolling(window=window, min_periods=1).min().shift(1)
            )
    
    return df

def create_advanced_features(df, target_cols, city_col='city'):
    """Create advanced features including rate of change and interactions"""
    # Rate of change features
    for col in target_cols:
        df[f'{col}_diff_1h'] = df.groupby(city_col)[col].diff(1)
        df[f'{col}_diff_3h'] = df.groupby(city_col)[col].diff(3)
        df[f'{col}_pct_change_1h'] = df.groupby(city_col)[col].pct_change(1)
    
    # Temperature-pollution interactions (if temperature exists)
    if 'hourly__temperature_2m' in df.columns:
        df['temp_pm2_5_interaction'] = df['hourly__temperature_2m'] * df['hourly__pm2_5']
        df['temp_pm10_interaction'] = df['hourly__temperature_2m'] * df['hourly__pm10']
        df['temp_category'] = pd.cut(df['hourly__temperature_2m'], 
                                     bins=[-np.inf, 10, 20, 30, np.inf],
                                     labels=[0, 1, 2, 3])  # Numeric for ML
    
    # Wind-pollution interactions (if wind exists)
    if 'hourly__wind_speed_10m' in df.columns:
        for col in ['hourly__pm2_5', 'hourly__pm10']:
            if col in df.columns:
                df[f'wind_{col.split("__")[1]}_interaction'] = df['hourly__wind_speed_10m'] * df[col]
    
    return df

def create_interaction_features(df, target_cols):
    """Create interaction features between pollutants"""
    df['pm_ratio'] = df['hourly__pm2_5'] / (df['hourly__pm10'] + 1e-6)
    df['pollution_index'] = (df['hourly__pm2_5'] + df['hourly__pm10'] + df['hourly__sulphur_dioxide'])
    
    return df

def create_targets(df, target_cols, forecast_horizon, city_col='city'):
    """Create target variables for multi-step forecasting"""
    target_dict = {}
    
    for col in target_cols:
        for h in range(1, forecast_horizon + 1):
            target_name = f'{col}_t+{h}'
            target_dict[target_name] = df.groupby(city_col)[col].shift(-h)
    
    target_df = pd.DataFrame(target_dict)
    return target_df

def prepare_features(df, target_cols, lag_periods, rolling_windows):
    """Create all features (without one-hot encoding city yet)"""
    print("Creating time features...")
    df = create_time_features(df)
    
    print("Creating lag features...")
    df = create_lag_features(df, target_cols, lag_periods)
    
    print("Creating rolling features (leak-proof)...")
    df = create_rolling_features(df, target_cols, rolling_windows)
    
    print("Creating advanced features...")
    df = create_advanced_features(df, target_cols)
    
    print("Creating interaction features...")
    df = create_interaction_features(df, target_cols)
    
    return df

def train_models_with_cv(X_train, y_train, use_gpu=True, n_splits=5):
    """Train XGBoost models with time series cross-validation"""
    models = {}
    cv_scores = {}
    
    # XGBoost parameters
    params = {
        'n_estimators': 500,
        'max_depth': 6,
        'learning_rate': 0.05,
        'subsample': 0.8,
        'colsample_bytree': 0.8,
        'min_child_weight': 3,
        'gamma': 0.1,
        'reg_alpha': 0.1,
        'reg_lambda': 1.0,
        'random_state': 42,
        'n_jobs': -1,
        'early_stopping_rounds': 50,
        'eval_metric': 'rmse'
    }
    
    if use_gpu:
        params['tree_method'] = 'hist'
        params['device'] = 'cuda'
    
    tscv = TimeSeriesSplit(n_splits=n_splits)
    
    for target in y_train.columns:
        print(f"\nTraining model for {target}...")
        
        # Remove rows with NaN targets
        train_mask = ~y_train[target].isna()
        X_train_clean = X_train[train_mask]
        y_train_clean = y_train[target][train_mask]
        
        # Time series cross-validation
        cv_rmse_scores = []
        
        for fold, (train_idx, val_idx) in enumerate(tscv.split(X_train_clean)):
            X_fold_train = X_train_clean.iloc[train_idx]
            y_fold_train = y_train_clean.iloc[train_idx]
            X_fold_val = X_train_clean.iloc[val_idx]
            y_fold_val = y_train_clean.iloc[val_idx]
            
            model_fold = XGBRegressor(**params)
            model_fold.fit(
                X_fold_train, y_fold_train,
                eval_set=[(X_fold_val, y_fold_val)],
                verbose=False
            )
            
            val_pred = model_fold.predict(X_fold_val)
            rmse = np.sqrt(mean_squared_error(y_fold_val, val_pred))
            cv_rmse_scores.append(rmse)
        
        cv_scores[target] = {
            'mean_rmse': np.mean(cv_rmse_scores),
            'std_rmse': np.std(cv_rmse_scores),
            'all_scores': cv_rmse_scores
        }
        
        print(f"  CV RMSE: {cv_scores[target]['mean_rmse']:.3f} (+/- {cv_scores[target]['std_rmse']:.3f})")
        
        # Train final model on all training data
        model = XGBRegressor(**params)
        # Create validation set (last 10% of training data)
        val_size = int(len(X_train_clean) * 0.1)
        X_final_train = X_train_clean.iloc[:-val_size]
        y_final_train = y_train_clean.iloc[:-val_size]
        X_final_val = X_train_clean.iloc[-val_size:]
        y_final_val = y_train_clean.iloc[-val_size:]
        
        model.fit(
            X_final_train, y_final_train,
            eval_set=[(X_final_train, y_final_train), (X_final_val, y_final_val)],
            verbose=False
        )
        
        models[target] = model
    
    return models, cv_scores

def analyze_feature_importance(models, feature_cols, top_n=20):
    """Analyze and plot feature importance across all models"""
    importance_df = pd.DataFrame()
    
    for target, model in models.items():
        importance = pd.DataFrame({
            'feature': feature_cols,
            'importance': model.feature_importances_,
            'target': target
        })
        importance_df = pd.concat([importance_df, importance])
    
    # Average importance across all targets
    avg_importance = importance_df.groupby('feature')['importance'].mean()
    avg_importance = avg_importance.sort_values(ascending=False).head(top_n)
    
    plt.figure(figsize=(12, 8))
    avg_importance.sort_values().plot(kind='barh')
    plt.title(f'Top {top_n} Most Important Features (Average Across All Models)', fontsize=14)
    plt.xlabel('Average Feature Importance')
    plt.ylabel('Feature')
    plt.tight_layout()
    plt.savefig('feature_importance.png', dpi=300, bbox_inches='tight')
    print("\n📊 Saved: feature_importance.png")
    plt.close()
    
    # Plot importance by pollutant
    fig, axes = plt.subplots(len(TARGET_COLS), 1, figsize=(14, 4*len(TARGET_COLS)))
    
    for i, pollutant in enumerate(TARGET_COLS):
        pollutant_models = [t for t in models.keys() if pollutant in t]
        pollutant_importance = importance_df[importance_df['target'].isin(pollutant_models)]
        pollutant_avg = pollutant_importance.groupby('feature')['importance'].mean()
        pollutant_avg = pollutant_avg.sort_values(ascending=False).head(top_n)
        
        ax = axes[i] if len(TARGET_COLS) > 1 else axes
        pollutant_avg.sort_values().plot(kind='barh', ax=ax)
        ax.set_title(f'{pollutant.upper()} - Top {top_n} Features', fontsize=12)
        ax.set_xlabel('Feature Importance')
    
    plt.tight_layout()
    plt.savefig('feature_importance_by_pollutant.png', dpi=300, bbox_inches='tight')
    print("📊 Saved: feature_importance_by_pollutant.png")
    plt.close()
    
    return avg_importance

def analyze_residuals(models, X_test, y_test, target_cols, forecast_horizon):
    """Analyze prediction residuals for model diagnostics"""
    n_pollutants = len(target_cols)
    fig, axes = plt.subplots(n_pollutants, 3, figsize=(15, 4*n_pollutants))
    fig.suptitle('Residual Analysis (1-Hour Ahead Predictions)', fontsize=16, y=1.001)
    
    if n_pollutants == 1:
        axes = axes.reshape(1, -1)
    
    for i, pollutant in enumerate(target_cols):
        target = f'{pollutant}_t+1'  # Analyze first horizon
        
        if target not in models:
            continue
            
        test_mask = ~y_test[target].isna()
        y_true = y_test[target][test_mask]
        y_pred = models[target].predict(X_test[test_mask])
        residuals = y_true - y_pred
        
        # Residual plot
        axes[i, 0].scatter(y_pred, residuals, alpha=0.3, s=10)
        axes[i, 0].axhline(y=0, color='r', linestyle='--', linewidth=2)
        axes[i, 0].set_xlabel('Predicted Values')
        axes[i, 0].set_ylabel('Residuals')
        axes[i, 0].set_title(f'{pollutant.split("__")[1].upper()} - Residuals vs Predicted')
        axes[i, 0].grid(True, alpha=0.3)
        
        # Histogram
        axes[i, 1].hist(residuals, bins=50, edgecolor='black', alpha=0.7)
        axes[i, 1].axvline(x=0, color='r', linestyle='--', linewidth=2)
        axes[i, 1].set_xlabel('Residuals')
        axes[i, 1].set_ylabel('Frequency')
        axes[i, 1].set_title('Residual Distribution')
        axes[i, 1].grid(True, alpha=0.3)
        
        # Q-Q plot
        stats.probplot(residuals, dist="norm", plot=axes[i, 2])
        axes[i, 2].set_title('Q-Q Plot (Normality Check)')
        axes[i, 2].grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig('residual_analysis.png', dpi=300, bbox_inches='tight')
    print("\n📊 Saved: residual_analysis.png")
    plt.close()

def plot_cv_scores(cv_scores, target_cols, forecast_horizon):
    """Plot cross-validation scores across forecast horizons"""
    n_pollutants = len(target_cols)
    fig, axes = plt.subplots(1, n_pollutants, figsize=(5*n_pollutants, 5))
    fig.suptitle('Cross-Validation RMSE by Forecast Horizon', fontsize=16, y=1.001)
    
    if n_pollutants == 1:
        axes = [axes]
    
    for i, pollutant in enumerate(target_cols):
        horizons = []
        means = []
        stds = []
        
        for h in range(1, forecast_horizon + 1):
            target = f'{pollutant}_t+{h}'
            if target in cv_scores:
                horizons.append(h)
                means.append(cv_scores[target]['mean_rmse'])
                stds.append(cv_scores[target]['std_rmse'])
        
        axes[i].errorbar(horizons, means, yerr=stds, marker='o', 
                        capsize=5, capthick=2, linewidth=2, markersize=8)
        axes[i].set_xlabel('Forecast Horizon (hours)')
        axes[i].set_ylabel('RMSE')
        axes[i].set_title(f'{pollutant.split("__")[1].upper()}')
        axes[i].grid(True, alpha=0.3)
        axes[i].set_xticks(range(1, forecast_horizon + 1))
    
    plt.tight_layout()
    plt.savefig('cv_scores_by_horizon.png', dpi=300, bbox_inches='tight')
    print("📊 Saved: cv_scores_by_horizon.png")
    plt.close()

def get_sample_predictions(models, X_test, y_test, feature_cols, 
                          target_cols, forecast_horizon, full_data_clean, cities):
    """Get 5 sets of predictions for each city"""
    predictions_by_city = {city: [] for city in cities}
    
    # Get city columns
    city_cols = {city: f'city_{city}' for city in cities}
    
    for city in cities:
        city_col = city_cols[city]
        if city_col not in full_data_clean.columns:
            continue
        
        city_test_mask = (full_data_clean.index.isin(X_test.index)) & (full_data_clean[city_col] == 1)
        city_test_indices = full_data_clean[city_test_mask].index
        
        if len(city_test_indices) >= 5:
            sample_indices = [city_test_indices[int(i * len(city_test_indices) / 5)] 
                            for i in range(5)]
        else:
            sample_indices = city_test_indices[:5]
        
        for idx in sample_indices:
            if idx not in X_test.index:
                continue
                
            sample_predictions = {'timestamp': full_data_clean.loc[idx, 'hourly__time']}
            
            for pollutant in target_cols:
                actuals = []
                preds = []
                
                for h in range(1, forecast_horizon + 1):
                    target = f'{pollutant}_t+{h}'
                    
                    if target in models and idx in y_test.index:
                        X_sample = X_test.loc[[idx]]
                        pred = models[target].predict(X_sample)[0]
                        actual = y_test.loc[idx, target]
                        
                        preds.append(pred)
                        actuals.append(actual)
                
                sample_predictions[pollutant] = {'actual': actuals, 'predicted': preds}
            
            predictions_by_city[city].append(sample_predictions)
    
    return predictions_by_city

def plot_predictions(predictions_by_city, target_cols, cities):
    """Plot prediction graphs for each city"""
    for city in cities:
        if not predictions_by_city[city]:
            continue
        
        n_pollutants = len(target_cols)
        fig, axes = plt.subplots(n_pollutants, 5, figsize=(25, 3*n_pollutants))
        fig.suptitle(f'{city.upper()} - 6-Hour Forecasts (5 Test Samples)', 
                     fontsize=16, y=1.001)
        
        if n_pollutants == 1:
            axes = axes.reshape(1, -1)
        
        for i, pollutant in enumerate(target_cols):
            for j, sample in enumerate(predictions_by_city[city][:5]):
                ax = axes[i, j]
                
                if pollutant in sample:
                    actuals = sample[pollutant]['actual']
                    preds = sample[pollutant]['predicted']
                    hours = list(range(1, len(actuals) + 1))
                    
                    valid_mask = [not (np.isnan(a) or np.isnan(p)) 
                                 for a, p in zip(actuals, preds)]
                    actuals_clean = [a for a, m in zip(actuals, valid_mask) if m]
                    preds_clean = [p for p, m in zip(preds, valid_mask) if m]
                    hours_clean = [h for h, m in zip(hours, valid_mask) if m]
                    
                    if actuals_clean:
                        ax.plot(hours_clean, actuals_clean, 'o-', label='Actual', 
                               linewidth=2, markersize=8)
                        ax.plot(hours_clean, preds_clean, 's--', label='Predicted', 
                               linewidth=2, markersize=8)
                        
                        ax.set_xlabel('Hours Ahead')
                        ax.set_ylabel('Value')
                        ax.set_title(f'{pollutant.split("__")[1].upper()}\n{sample["timestamp"].strftime("%Y-%m-%d %H:%M")}', 
                                   fontsize=9)
                        ax.legend()
                        ax.grid(True, alpha=0.3)
                        ax.set_xticks(range(1, 7))
        
        plt.tight_layout()
        plt.savefig(f'predictions_{city}.png', dpi=300, bbox_inches='tight')
        print(f"📈 Saved: predictions_{city}.png")
        plt.close()

def main():
    print("="*80)
    print("Enhanced XGBoost Multi-City Air Quality Forecasting System")
    print("="*80)
    
    # Load data
    print("\n1. Loading data...")
    df = load_and_prepare_data(CITIES)
    print(f"   Loaded {len(df)} total records from {len(CITIES)} cities")
    print(f"   Date range: {df['hourly__time'].min()} to {df['hourly__time'].max()}")
    
    # Prepare features (without one-hot encoding city yet)
    print("\n2. Feature engineering...")
    df_featured = prepare_features(df.copy(), TARGET_COLS, LAG_FEATURES, ROLLING_WINDOWS)
    
    # Create targets (city column still exists here)
    print("\n3. Creating target variables...")
    targets = create_targets(df_featured, TARGET_COLS, FORECAST_HORIZON, city_col='city')
    
    # One-hot encode city and hour_category
    print("\n4. One-hot encoding categorical variables...")
    df_featured = pd.get_dummies(df_featured, columns=['city', 'hour_category'], prefix=['city', 'hour_cat'])
    
    # Combine features and targets
    full_data = pd.concat([df_featured, targets], axis=1)
    
    # Drop rows with insufficient history
    print("\n5. Cleaning data...")
    feature_cols = [col for col in full_data.columns 
                   if col not in TARGET_COLS + ['hourly__time'] + list(targets.columns)]
    
    full_data_clean = full_data.dropna(subset=feature_cols)
    print(f"   Retained {len(full_data_clean)} records after removing incomplete features")
    
    # Split data (time-series split)
    split_idx = int(len(full_data_clean) * 0.85)
    train_data = full_data_clean.iloc[:split_idx]
    test_data = full_data_clean.iloc[split_idx:]
    
    print(f"   Train set: {len(train_data)} records")
    print(f"   Test set: {len(test_data)} records")
    
    # Prepare X and y
    X_train = train_data[feature_cols]
    y_train = train_data[list(targets.columns)]
    
    X_test = test_data[feature_cols]
    y_test = test_data[list(targets.columns)]
    
    # Scale features
    print("\n6. Scaling features...")
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    X_train_scaled = pd.DataFrame(X_train_scaled, columns=feature_cols, index=X_train.index)
    X_test_scaled = pd.DataFrame(X_test_scaled, columns=feature_cols, index=X_test.index)
    
    # Train models with cross-validation
    print("\n7. Training models with time series cross-validation...")
    print(f"   Training {len(targets.columns)} models (5 pollutants × 6 hours)")
    models, cv_scores = train_models_with_cv(X_train_scaled, y_train, use_gpu=True, n_splits=5)
    
    # Plot CV scores
    print("\n8. Creating cross-validation visualizations...")
    plot_cv_scores(cv_scores, TARGET_COLS, FORECAST_HORIZON)
    
    # Feature importance analysis
    print("\n9. Analyzing feature importance...")
    top_features = analyze_feature_importance(models, feature_cols, top_n=20)
    print("\nTop 10 Most Important Features:")
    for i, (feat, imp) in enumerate(top_features.head(10).items(), 1):
        print(f"  {i:2d}. {feat:50s} {imp:.4f}")
    
    # Evaluate on test set
    print("\n10. Evaluating on test set...")
    test_metrics = {}
    
    for target in y_test.columns:
        test_mask = ~y_test[target].isna()
        X_test_clean = X_test_scaled[test_mask]
        y_test_clean = y_test[target][test_mask]
        
        if len(y_test_clean) > 0:
            test_pred = models[target].predict(X_test_clean)
            mae = mean_absolute_error(y_test_clean, test_pred)
            rmse = np.sqrt(mean_squared_error(y_test_clean, test_pred))
            r2 = r2_score(y_test_clean, test_pred)
            
            test_metrics[target] = {'MAE': mae, 'RMSE': rmse, 'R2': r2}
    
    # Print summary
    print("\n" + "="*80)
    print("TEST SET PERFORMANCE SUMMARY")
    print("="*80)
    
    for pollutant in TARGET_COLS:
        print(f"\n{pollutant.upper()}:")
        for h in range(1, FORECAST_HORIZON + 1):
            target = f"{pollutant}_t+{h}"
            if target in test_metrics:
                m = test_metrics[target]
                print(f"  +{h}h: MAE={m['MAE']:7.3f}, RMSE={m['RMSE']:7.3f}, R²={m['R2']:6.3f}")
    
    # Residual analysis
    print("\n11. Performing residual analysis...")
    analyze_residuals(models, X_test_scaled, y_test, TARGET_COLS, FORECAST_HORIZON)
    
    # Get sample predictions
    print("\n12. Generating prediction visualizations...")
    predictions_by_city = get_sample_predictions(
        models, X_test_scaled, y_test, feature_cols, 
        TARGET_COLS, FORECAST_HORIZON, full_data_clean, CITIES
    )
    
    # Plot predictions for each city
    plot_predictions(predictions_by_city, TARGET_COLS, CITIES)
    
    # Save models and preprocessing objects
    print("\n13. Saving models...")
    joblib.dump(models, 'xgboost_models.pkl')
    joblib.dump(scaler, 'scaler.pkl')
    joblib.dump(feature_cols, 'feature_cols.pkl')
    print("   Saved: xgboost_models.pkl, scaler.pkl, feature_cols.pkl")
    
    print("\n" + "="*80)
    print("Training complete! Generated visualizations:")
    print("  - cv_scores_by_horizon.png (CV performance)")
    print("  - feature_importance.png (overall feature importance)")
    print("  - feature_importance_by_pollutant.png (importance per pollutant)")
    print("  - residual_analysis.png (model diagnostics)")
    print("  - predictions_chicago.png (sample predictions)")
    print("  - predictions_losangeles.png")
    print("  - predictions_sanfrancisco.png")
    print("  - predictions_seattle.png")
    print("="*80)

if __name__ == "__main__":
    main()