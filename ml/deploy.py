from azure.ai.ml import MLClient
from azure.ai.ml.entities import (
    ManagedOnlineEndpoint,
    ManagedOnlineDeployment,
    CodeConfiguration
)
from azure.identity import DefaultAzureCredential
from azure.mgmt.resource import ResourceManagementClient
import datetime
import time

# Initialize credentials and clients
credential = DefaultAzureCredential()
subscription_id = "a20d1d25-9242-4a09-9e10-2a3a7e547e6e"

# Initialize Resource Management Client
resource_client = ResourceManagementClient(credential, subscription_id)

# Register ALL required resource providers for Azure ML
required_providers = [
    'Microsoft.MachineLearningServices',
    'Microsoft.Storage',
    'Microsoft.KeyVault',
    'Microsoft.ContainerRegistry',
    'Microsoft.Compute',
    'Microsoft.Network',
    'Microsoft.ManagedIdentity'
]

print("Checking and registering required resource providers...")
for provider in required_providers:
    try:
        # Check if already registered
        provider_details = resource_client.providers.get(provider)
        if provider_details.registration_state != "Registered":
            print(f"Registering {provider}...")
            resource_client.providers.register(provider)
            # Wait a bit for registration to complete
            time.sleep(2)
        else:
            print(f"✅ {provider} already registered")
    except Exception as e:
        print(f"⚠️ Warning: Could not register {provider}: {str(e)}")

# Give providers time to fully register
print("\nWaiting for providers to complete registration...")
time.sleep(10)

# Initialize ML Client
ml_client = MLClient(
    credential=credential,
    subscription_id=subscription_id,
    resource_group_name="akshahi2-rg",
    workspace_name="aqi-prediction"
)

# Generate unique endpoint name
endpoint_name = f"model-endpoint-{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
print(f"\nCreating endpoint: {endpoint_name}")

# 1️⃣ Create endpoint
endpoint = ManagedOnlineEndpoint(
    name=endpoint_name,
    description="XGBoost model endpoint for AQI prediction",
    auth_mode="key"
)

print("Creating endpoint...")
ml_client.begin_create_or_update(endpoint).wait()
print(f"✅ Endpoint '{endpoint_name}' created successfully!")

# 2️⃣ Get the registered model
print("\nRetrieving registered model...")
model = ml_client.models.get(name="xgboost-model", version="1")
print(f"✅ Retrieved model: {model.name}, version {model.version}")

# 3️⃣ Get the existing environment
print("\nRetrieving existing environment...")
env = ml_client.environments.get(name="nasa-custom-environment", version="1")
print(f"✅ Retrieved environment: {env.name}, version {env.version}")

# 4️⃣ Create deployment
print("\nCreating deployment...")
deployment = ManagedOnlineDeployment(
    name="blue",
    endpoint_name=endpoint_name,
    model=model,
    environment=env,
    code_configuration=CodeConfiguration(
        code=".",
        scoring_script="inference.py"
    ),
    instance_type="Standard_DS2_v2",
    instance_count=1,
)

ml_client.begin_create_or_update(deployment).wait()
print(f"✅ Deployment 'blue' created successfully!")

# 5️⃣ Set traffic to this deployment (make it live)
print("\nSetting traffic to 100% for deployment...")
endpoint.traffic = {"blue": 100}
ml_client.begin_create_or_update(endpoint).wait()
print(f"✅ Traffic set to 100% for 'blue' deployment")

# 6️⃣ Get endpoint details
print("\n" + "="*60)
print("ENDPOINT READY!")
print("="*60)
endpoint_details = ml_client.online_endpoints.get(name=endpoint_name)
print(f"\n📍 Endpoint Name: {endpoint_name}")
print(f"🔗 Scoring URI: {endpoint_details.scoring_uri}")
print(f"📄 Swagger URI: {endpoint_details.swagger_uri}")

# Get keys for authentication
keys = ml_client.online_endpoints.get_keys(name=endpoint_name)
print(f"\n🔑 Authentication Keys:")
print(f"Primary Key: {keys.primary_key}")
print(f"Secondary Key: {keys.secondary_key}")

print("\n" + "="*60)
print("You can now call your endpoint using the scoring URI and primary key!")
print("="*60)