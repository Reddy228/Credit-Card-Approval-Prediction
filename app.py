from flask import Flask, render_template, request, jsonify
import pandas as pd
import numpy as np
import os
import joblib
import json

app = Flask(__name__)

# Paths
MODELS_DIR = 'models'
PREPROCESSOR_PATH = os.path.join(MODELS_DIR, 'preprocessor.pkl')
BEST_MODEL_PATH = os.path.join(MODELS_DIR, 'best_model.pkl')
METRICS_PATH = os.path.join(MODELS_DIR, 'model_metrics.json')

# Global variables for model/preprocessor
preprocessor = None
best_model = None
best_model_name = "Not Loaded"
metrics_data = {}

def load_ml_assets():
    global preprocessor, best_model, best_model_name, metrics_data
    if os.path.exists(PREPROCESSOR_PATH) and os.path.exists(BEST_MODEL_PATH):
        try:
            preprocessor = joblib.load(PREPROCESSOR_PATH)
            best_model = joblib.load(BEST_MODEL_PATH)
            print("Successfully loaded model and preprocessor.")
        except Exception as e:
            print(f"Error loading model/preprocessor: {e}")
            
    if os.path.exists(METRICS_PATH):
        try:
            with open(METRICS_PATH, 'r') as f:
                metrics_data = json.load(f)
                best_model_name = metrics_data.get('best_model', 'Best Model')
            print("Successfully loaded model metrics summary.")
        except Exception as e:
            print(f"Error loading metrics summary: {e}")

# ==============================================================================
# UI Routes
# ==============================================================================
@app.route('/')
@app.route('/analyst')
def analyst_portal():
    load_ml_assets() # Reload if assets became available
    return render_template('analyst.html', active_page='analyst', best_model_name=best_model_name)

@app.route('/compliance')
def compliance_hub():
    load_ml_assets()
    return render_template('compliance.html', active_page='compliance', best_model_name=best_model_name)

@app.route('/self_service')
def self_service_wizard():
    load_ml_assets()
    return render_template('self_service.html', active_page='self_service', best_model_name=best_model_name)

@app.route('/models')
def model_analytics():
    load_ml_assets()
    return render_template('models.html', active_page='models', best_model_name=best_model_name)

@app.route('/watson')
def watson_console():
    load_ml_assets()
    return render_template('watson.html', active_page='watson', best_model_name=best_model_name)

# ==============================================================================
# API Endpoints
# ==============================================================================
@app.route('/api/predict', methods=['POST'])
def predict_approval():
    global preprocessor, best_model
    if preprocessor is None or best_model is None:
        load_ml_assets()
        if preprocessor is None or best_model is None:
            return jsonify({'error': 'Machine learning model not loaded. Train the models first.'}), 500

    try:
        data = request.get_json()
        
        # Extrapolate Kaggle representation of Age and Employment
        age_years = float(data.get('AGE_YEARS', 30))
        days_birth = int(-age_years * 365.25)
        
        income_type = data.get('NAME_INCOME_TYPE', 'Working')
        if income_type == 'Pensioner':
            days_employed = 365243
        else:
            emp_years = float(data.get('EMPLOYMENT_DURATION_YEARS', 2))
            days_employed = int(-emp_years * 365.25)

        # Build payload DataFrame
        payload = pd.DataFrame([{
            'CODE_GENDER': data.get('CODE_GENDER', 'F'),
            'FLAG_OWN_CAR': data.get('FLAG_OWN_CAR', 'N'),
            'FLAG_OWN_REALTY': data.get('FLAG_OWN_REALTY', 'Y'),
            'AMT_INCOME_TOTAL': float(data.get('AMT_INCOME_TOTAL', 150000)),
            'NAME_INCOME_TYPE': income_type,
            'NAME_EDUCATION_TYPE': data.get('NAME_EDUCATION_TYPE', 'Higher education'),
            'NAME_FAMILY_STATUS': data.get('NAME_FAMILY_STATUS', 'Married'),
            'NAME_HOUSING_TYPE': data.get('NAME_HOUSING_TYPE', 'House / apartment'),
            'DAYS_BIRTH': days_birth,
            'DAYS_EMPLOYED': days_employed,
            'CNT_CREDIT_INQUIRIES': int(data.get('CNT_CREDIT_INQUIRIES', 0)),
            'EXISTING_LOAN_BALANCE': float(data.get('EXISTING_LOAN_BALANCE', 0))
        }])

        # Process and predict
        processed_payload = preprocessor.transform(payload)
        prediction = int(best_model.predict(processed_payload)[0]) # 1: High Risk, 0: Low Risk
        
        if hasattr(best_model, 'predict_proba'):
            proba = best_model.predict_proba(processed_payload)[0]
            confidence = float(proba[prediction])
        else:
            confidence = 1.0

        # Output mapping: Class 1 means high-risk (rejected), Class 0 means low-risk (approved)
        approved = (prediction == 0)

        return jsonify({
            'prediction': prediction,
            'approved': approved,
            'confidence': confidence
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/api/metrics', methods=['GET'])
def get_metrics():
    if not metrics_data:
        load_ml_assets()
    if not metrics_data:
        return jsonify({'error': 'Metrics log not found. Train the models first.'}), 500
    return jsonify(metrics_data)

@app.route('/api/batch', methods=['GET'])
def get_batch():
    app_record_path = 'data/application_record.csv'
    credit_record_path = 'data/credit_record.csv'
    
    if not os.path.exists(app_record_path) or not os.path.exists(credit_record_path):
        return jsonify({'error': 'Generated datasets not found. Run training/data generation first.'}), 500
        
    try:
        app_df = pd.read_csv(app_record_path)
        credit_df = pd.read_csv(credit_record_path)
        
        # Label conversions to check high-risk
        credit_df['RISK_LABEL'] = credit_df['STATUS'].isin(['2', '3', '4', '5']).astype(int)
        risk_labels = credit_df.groupby('ID')['RISK_LABEL'].max().reset_index()
        
        merged = pd.merge(app_df, risk_labels, on='ID', how='inner')
        
        # Take a balanced sample of 100 records for the batch compliance dashboard
        # Let's take 15 high-risk records and 85 low-risk records if possible, to have a realistic, predictable look
        high_risk_subset = merged[merged['RISK_LABEL'] == 1].head(15)
        low_risk_subset = merged[merged['RISK_LABEL'] == 0].head(85)
        
        sample_df = pd.concat([high_risk_subset, low_risk_subset]).sample(frac=1, random_state=42)
        
        batch_records = []
        for _, row in sample_df.iterrows():
            client_id = int(row['ID'])
            
            # Fetch status history for this client
            history = credit_df[credit_df['ID'] == client_id].sort_values(by='MONTHS_BALANCE', ascending=False)
            status_history = []
            for _, h_row in history.iterrows():
                status_history.append({
                    'month': int(h_row['MONTHS_BALANCE']),
                    'status': str(h_row['STATUS'])
                })
                
            batch_records.append({
                'id': client_id,
                'gender': str(row['CODE_GENDER']),
                'age': int(round(-row['DAYS_BIRTH'] / 365.25)),
                'education': str(row['NAME_EDUCATION_TYPE']),
                'income': float(row['AMT_INCOME_TOTAL']),
                'inquiries': int(row['CNT_CREDIT_INQUIRIES']),
                'loan_balance': float(row['EXISTING_LOAN_BALANCE']),
                'risk_flag': int(row['RISK_LABEL']),
                'status_history': status_history
            })
            
        return jsonify(batch_records)

    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    # Try loading ML assets initially
    load_ml_assets()
    app.run(debug=True, port=5000)
