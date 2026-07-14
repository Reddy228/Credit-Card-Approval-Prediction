"""
IBM Watson Machine Learning (WML) Integration Template

This script provides a complete template demonstrating how to connect to IBM Watson Machine Learning,
store your trained credit card approval model in the Cloud repository, deploy it to an online
scoring endpoint, and perform predictions (scoring) using the ibm-watson-machine-learning SDK.

Prerequisites:
    pip install ibm-watson-machine-learning
"""

import os
import joblib
from ibm_watson_machine_learning import APIClient

# ==============================================================================
# 1. Watson Machine Learning Credentials & Configuration
# ==============================================================================
# Get your API key and URL from your IBM Cloud account.
# For IBM Cloud US South (Dallas), URL is: https://us-south.ml.cloud.ibm.com
# For Europe (Frankfurt), URL is: https://eu-de.ml.cloud.ibm.com
WML_CREDENTIALS = {
    "url": os.getenv("WML_URL", "https://us-south.ml.cloud.ibm.com"),
    "apikey": os.getenv("WML_APIKEY", "YOUR_IBM_CLOUD_APIKEY_HERE")
}

# The Space ID of your deployment space.
# You can find this in your IBM Cloud Watson Studio interface under "Deployments" -> "Spaces".
SPACE_ID = os.getenv("WML_SPACE_ID", "YOUR_DEPLOYMENT_SPACE_ID_HERE")

def run_wml_pipeline():
    # Verify placeholder credentials are not used when executing
    if WML_CREDENTIALS["apikey"] == "YOUR_IBM_CLOUD_APIKEY_HERE":
        print("[WARNING] WML API key has not been configured. Running in documentation/dry-run mode.")
        print("Please set your credentials to run the full pipeline.")
        return

    # ==============================================================================
    # 2. Initialize Watson ML Client and Set Default Space
    # ==============================================================================
    print("Connecting to Watson Machine Learning...")
    client = APIClient(WML_CREDENTIALS)
    
    # Set the target deployment space
    client.set.default_space(SPACE_ID)
    print(f"Target Space ID set to: {SPACE_ID}")

    # ==============================================================================
    # 3. Define Model Metadata and Register in Cloud Repository
    # ==============================================================================
    # Load your trained model and preprocessing pipeline locally
    # Note: WML allows deploying individual estimators or pipeline models.
    # It is recommended to upload a single scikit-learn Pipeline object containing
    # both the preprocessor and the classifier so that raw inputs are preprocessed in the cloud.
    
    # Let's assume we've saved a combined Pipeline object as 'models/credit_pipeline.pkl'
    pipeline_path = 'models/credit_pipeline.pkl'
    if not os.path.exists(pipeline_path):
        # Fallback if we have individual preprocessor/model files
        print(f"Combined pipeline not found at {pipeline_path}. Ensure your models are trained.")
        return

    # Define model details and properties
    software_spec_uid = client.software_specifications.get_id_by_name("runtime-22.2-py3.10") # Check IBM documentation for latest specs
    
    model_metadata = {
        client.repository.ModelMetaNames.NAME: "Credit_Card_Approval_Model",
        client.repository.ModelMetaNames.DESCRIPTION: "ML model to automate credit card approval decisions",
        client.repository.ModelMetaNames.TYPE: "scikit-learn_1.1", # Match the model type and library version
        client.repository.ModelMetaNames.SOFTWARE_SPEC_UID: software_spec_uid
    }

    print("Registering model in the Watson ML repository...")
    model_details = client.repository.store_model(
        model=pipeline_path,
        meta_props=model_metadata
    )
    
    model_uid = client.repository.get_model_uid(model_details)
    print(f"Model successfully stored in WML. Model UID: {model_uid}")

    # ==============================================================================
    # 4. Deploy Model as an Online Endpoint
    # ==============================================================================
    print("Creating online deployment for model...")
    deployment_metadata = {
        client.deployments.ConfigurationMetaNames.NAME: "Credit_Approval_Deployment",
        client.deployments.ConfigurationMetaNames.DESCRIPTION: "Online web service for credit approval scoring",
        client.deployments.ConfigurationMetaNames.ONLINE: {} # Indicates a web service endpoint
    }

    deployment_details = client.deployments.create(
        artifact_uid=model_uid,
        meta_props=deployment_metadata
    )
    
    deployment_uid = client.deployments.get_uid(deployment_details)
    scoring_endpoint = client.deployments.get_scoring_href(deployment_details)
    print(f"Deployment successfully created! Deployment UID: {deployment_uid}")
    print(f"Online Scoring Endpoint URL: {scoring_endpoint}")

    # ==============================================================================
    # 5. Score Live Payload (Example Prediction)
    # ==============================================================================
    # Define a test applicant payload matching the original training columns
    # Demographics and credit features:
    # ['CODE_GENDER', 'FLAG_OWN_CAR', 'FLAG_OWN_REALTY', 'AMT_INCOME_TOTAL', 
    #  'NAME_INCOME_TYPE', 'NAME_EDUCATION_TYPE', 'NAME_FAMILY_STATUS', 
    #  'NAME_HOUSING_TYPE', 'DAYS_BIRTH', 'DAYS_EMPLOYED', 
    #  'CNT_CREDIT_INQUIRIES', 'EXISTING_LOAN_BALANCE']
    
    test_payload = {
        client.deployments.ScoringMetaNames.INPUT_DATA: [
            {
                "fields": [
                    "CODE_GENDER", "FLAG_OWN_CAR", "FLAG_OWN_REALTY", "AMT_INCOME_TOTAL",
                    "NAME_INCOME_TYPE", "NAME_EDUCATION_TYPE", "NAME_FAMILY_STATUS",
                    "NAME_HOUSING_TYPE", "DAYS_BIRTH", "DAYS_EMPLOYED", 
                    "CNT_CREDIT_INQUIRIES", "EXISTING_LOAN_BALANCE"
                ],
                "values": [
                    ["F", "N", "Y", 185000.0, "Working", "Higher education", "Married", "House / apartment", -15000, -2500, 1, 12000.0]
                ]
            }
        ]
    }

    print("Sending live test payload for scoring...")
    predictions = client.deployments.score(deployment_uid, test_payload)
    
    print("Scoring Response:")
    print(predictions)

if __name__ == "__main__":
    run_wml_pipeline()
