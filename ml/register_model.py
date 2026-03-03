from azure.ai.ml import MLClient
from azure.identity import DefaultAzureCredential
from azure.ai.ml.entities import Model
from pathlib import Path

# Initialize ML Client
ml_client = MLClient(
    credential=DefaultAzureCredential(),
    subscription_id="a20d1d25-9242-4a09-9e10-2a3a7e547e6e",
    resource_group_name="akshahi2-rg",
    workspace_name="aqi-prediction"

)


# Specify the directory containing your model files
model_dir = "models"  # Directory containing xgboost_models.pkl, feature_cols.pkl, scaler.pkl

# Register the model
model = ml_client.models.create_or_update(
    Model(
        path=model_dir,  # Path to directory with all model artifacts
        name="xgboost-model",
        description="XGBoost model with feature columns and scaler",
        type="custom_model",
        version="1"
    )
)

print(f"Model registered: {model.name}, Version: {model.version}")
print(f"Model ID: {model.id}")