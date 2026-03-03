from azure.ai.ml import MLClient
from azure.ai.ml.entities import Environment
from azure.identity import DefaultAzureCredential

ml_client = MLClient(
    credential=DefaultAzureCredential(),
    subscription_id="a20d1d25-9242-4a09-9e10-2a3a7e547e6e",
    resource_group_name="akshahi2-rg",
    workspace_name="aqi-prediction"

)

env = Environment(
    name="nasa-custom-environment",
    description="Environment with XGBoost and Flask for NASA project",
    image="mcr.microsoft.com/azureml/openmpi4.1.0-ubuntu20.04:latest",
    conda_file="environment.yml",  
)

ml_client.environments.create_or_update(env)
print("Environment created successfully!")