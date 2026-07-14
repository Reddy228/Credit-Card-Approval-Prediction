import pandas as pd
import numpy as np
import json
import joblib
import os
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.impute import SimpleImputer
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score

# Classifiers
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.tree import DecisionTreeClassifier
from xgboost import XGBClassifier

def train_and_evaluate():
    print("Loading data...")
    app_df = pd.read_csv('data/application_record.csv')
    credit_df = pd.read_csv('data/credit_record.csv')
    
    # 1. Label Engineering
    print("Engineering risk labels from payment history...")
    # Convert multi-class status: '2', '3', '4', '5' -> 1 (high risk), others -> 0
    credit_df['RISK_LABEL'] = credit_df['STATUS'].isin(['2', '3', '4', '5']).astype(int)
    
    # Aggregate by ID: if any month is high-risk, label applicant as high-risk (Class 1)
    risk_labels = credit_df.groupby('ID')['RISK_LABEL'].max().reset_index()
    
    # Merge with application records
    df = pd.merge(app_df, risk_labels, on='ID', how='inner')
    print(f"Merged dataset shape: {df.shape}")
    print(f"Label distribution:\n{df['RISK_LABEL'].value_counts(normalize=True)}")
    
    # Define target and features
    X = df.drop(columns=['ID', 'RISK_LABEL'])
    y = df['RISK_LABEL']
    
    # Identify column types
    num_cols = ['AMT_INCOME_TOTAL', 'DAYS_BIRTH', 'DAYS_EMPLOYED', 'CNT_CREDIT_INQUIRIES', 'EXISTING_LOAN_BALANCE']
    cat_cols = ['CODE_GENDER', 'FLAG_OWN_CAR', 'FLAG_OWN_REALTY', 'NAME_INCOME_TYPE', 'NAME_EDUCATION_TYPE', 'NAME_FAMILY_STATUS', 'NAME_HOUSING_TYPE']
    
    # 2. Build Preprocessor Pipeline
    print("Building preprocessing pipeline...")
    num_transformer = Pipeline(steps=[
        ('imputer', SimpleImputer(strategy='median')),
        ('scaler', StandardScaler())
    ])
    
    cat_transformer = Pipeline(steps=[
        ('imputer', SimpleImputer(strategy='most_frequent')),
        ('onehot', OneHotEncoder(handle_unknown='ignore', sparse_output=False))
    ])
    
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', num_transformer, num_cols),
            ('cat', cat_transformer, cat_cols)
        ]
    )
    
    # Split data (stratified to handle any class imbalance)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    # Fit the preprocessor on the training data
    print("Fitting and transforming data...")
    X_train_proc = preprocessor.fit_transform(X_train)
    X_test_proc = preprocessor.transform(X_test)
    
    # Get the feature names after one-hot encoding for feature importance analysis
    cat_encoder = preprocessor.named_transformers_['cat'].named_steps['onehot']
    encoded_cat_cols = cat_encoder.get_feature_names_out(cat_cols).tolist()
    feature_names = num_cols + encoded_cat_cols
    
    # Save the preprocessor pipeline
    os.makedirs('models', exist_ok=True)
    joblib.dump(preprocessor, 'models/preprocessor.pkl')
    print("Saved preprocessing pipeline to models/preprocessor.pkl")
    
    # 3. Model Training & Evaluation
    # Calculate scale_pos_weight for XGBoost to balance positive and negative classes
    pos_weight = (len(y_train) - sum(y_train)) / sum(y_train)

    models = {
        'Logistic Regression': LogisticRegression(class_weight='balanced', max_iter=1000, random_state=42),
        'Decision Tree': DecisionTreeClassifier(class_weight='balanced', max_depth=6, random_state=42),
        'Random Forest': RandomForestClassifier(class_weight='balanced', n_estimators=100, max_depth=10, random_state=42),
        'XGBoost': XGBClassifier(scale_pos_weight=pos_weight, eval_metric='logloss', random_state=42)
    }
    
    metrics = {}
    best_model_name = None
    best_f1 = -1
    best_model_obj = None
    
    for name, model in models.items():
        print(f"Training {name}...")
        model.fit(X_train_proc, y_train)
        
        # Predict
        y_pred = model.predict(X_test_proc)
        y_prob = model.predict_proba(X_test_proc)[:, 1] if hasattr(model, 'predict_proba') else y_pred
        
        # Calculate metrics
        acc = accuracy_score(y_test, y_pred)
        prec = precision_score(y_test, y_pred, zero_division=0)
        rec = recall_score(y_test, y_pred, zero_division=0)
        f1 = f1_score(y_test, y_pred, zero_division=0)
        auc = roc_auc_score(y_test, y_prob)
        
        print(f"{name} -> Accuracy: {acc:.4f}, Precision: {prec:.4f}, Recall: {rec:.4f}, F1: {f1:.4f}, AUC: {auc:.4f}")
        
        # Save feature importances if available
        importances = []
        if hasattr(model, 'feature_importances_'):
            importances = model.feature_importances_.tolist()
        elif hasattr(model, 'coef_'):
            importances = model.coef_[0].tolist()
            
        metrics[name] = {
            'accuracy': float(acc),
            'precision': float(prec),
            'recall': float(rec),
            'f1_score': float(f1),
            'roc_auc': float(auc),
            'feature_importances': dict(zip(feature_names, importances)) if importances else {}
        }
        
        # We'll use F1-Score to determine the best model since defaults are typically imbalanced
        if f1 > best_f1:
            best_f1 = f1
            best_model_name = name
            best_model_obj = model
            
    print(f"Best model based on F1-Score: {best_model_name} (F1: {best_f1:.4f})")
    
    # Save best model
    joblib.dump(best_model_obj, 'models/best_model.pkl')
    print("Saved best model to models/best_model.pkl")
    
    # Write metadata info
    metrics_summary = {
        'best_model': best_model_name,
        'feature_names': feature_names,
        'metrics': metrics
    }
    
    with open('models/model_metrics.json', 'w') as f:
        json.dump(metrics_summary, f, indent=4)
    print("Saved metrics summary to models/model_metrics.json")

if __name__ == '__main__':
    train_and_evaluate()
