# upload_models.py
from azure.core.exceptions import ResourceExistsErrors
from azure.storage.blob import BlobServiceClient
import os

connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
blob_service_client = BlobServiceClient.from_connection_string(connection_string)

container_name = "models"


try:
    container_client = blob_service_client.create_container(container_name)
    print(f"Container '{container_name}' created.")
except ResourceExistsError:
    container_client = blob_service_client.get_container_client(container_name)
    print(f"Container '{container_name}' already exists, using existing one.")


# Upload model files
files_to_upload = [
    'xgboost_models.pkl',
    'scaler.pkl',
    'feature_cols.pkl'
]

for file_name in files_to_upload:
    blob_client = blob_service_client.get_blob_client(
        container=container_name, 
        blob=file_name
    )
    with open(file_name, "rb") as data:
        blob_client.upload_blob(data, overwrite=True)
    print(f"✓ Uploaded {file_name}")