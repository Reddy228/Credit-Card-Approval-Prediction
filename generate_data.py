import pandas as pd
import numpy as np
import os

def generate_datasets(num_records=5000, seed=42):
    np.random.seed(seed)
    print(f"Generating {num_records} synthetic credit applicant records...")
    
    # 1. Generate Application Records
    ids = np.arange(5000000, 5000000 + num_records)
    
    # Gender (M/F)
    genders = np.random.choice(['M', 'F'], size=num_records, p=[0.4, 0.6])
    
    # Own Car / Own Realty (Y/N)
    own_car = np.random.choice(['Y', 'N'], size=num_records, p=[0.35, 0.65])
    own_realty = np.random.choice(['Y', 'N'], size=num_records, p=[0.65, 0.35])
    
    # Income (Lognormal distribution to simulate real-world skewness)
    income_base = np.random.lognormal(mean=11.9, sigma=0.5, size=num_records)
    income = np.clip(income_base * 1.5, 30000, 800000).round(-2)
    
    # Income Type
    income_types = np.random.choice(
        ['Working', 'Commercial associate', 'State servant', 'Pensioner', 'Student'],
        size=num_records,
        p=[0.55, 0.25, 0.10, 0.098, 0.002]
    )
    
    # Education Type
    education_types = np.random.choice(
        ['Secondary / secondary special', 'Higher education', 'Incomplete higher', 'Lower secondary', 'Academic degree'],
        size=num_records,
        p=[0.62, 0.30, 0.05, 0.028, 0.002]
    )
    
    # Family Status
    family_status = np.random.choice(
        ['Married', 'Single / not married', 'Civil marriage', 'Separated', 'Widow'],
        size=num_records,
        p=[0.65, 0.15, 0.10, 0.06, 0.04]
    )
    
    # Housing Type
    housing_types = np.random.choice(
        ['House / apartment', 'With parents', 'Municipal apartment', 'Rented apartment', 'Office apartment', 'Co-op apartment'],
        size=num_records,
        p=[0.88, 0.06, 0.03, 0.02, 0.008, 0.002]
    )
    
    # Age (between 21 and 68 years)
    age_years = np.random.uniform(21, 68, size=num_records)
    days_birth = (-age_years * 365.25).astype(int)
    
    # Employment duration: pensioners might be unemployed, others employed.
    days_employed = []
    for idx, inc_type in enumerate(income_types):
        if inc_type == 'Pensioner':
            # Kaggle representation: 365243 means unemployed/pensioner
            days_employed.append(365243)
        else:
            # Employed: duration between 0.5 and 40 years, restricted by age
            max_work = min(age_years[idx] - 18, 40)
            work_years = np.random.uniform(0.5, max(0.5, max_work))
            days_employed.append(int(-work_years * 365.25))
    days_employed = np.array(days_employed)
    
    # Credit Inquiries (0 to 8)
    inquiries = np.random.poisson(lam=1.2, size=num_records)
    inquiries = np.clip(inquiries, 0, 8)
    
    # Existing Loan Balance (correlated with income)
    loan_balance = []
    for inc in income:
        # standard balance between 0 and 1.5x annual income, but 30% have no loans
        if np.random.rand() < 0.3:
            loan_balance.append(0.0)
        else:
            bal = np.random.uniform(1000, inc * 1.2)
            loan_balance.append(round(bal, -2))
    loan_balance = np.array(loan_balance)
    
    # Create Application DataFrame
    df_app = pd.DataFrame({
        'ID': ids,
        'CODE_GENDER': genders,
        'FLAG_OWN_CAR': own_car,
        'FLAG_OWN_REALTY': own_realty,
        'AMT_INCOME_TOTAL': income,
        'NAME_INCOME_TYPE': income_types,
        'NAME_EDUCATION_TYPE': education_types,
        'NAME_FAMILY_STATUS': family_status,
        'NAME_HOUSING_TYPE': housing_types,
        'DAYS_BIRTH': days_birth,
        'DAYS_EMPLOYED': days_employed,
        'CNT_CREDIT_INQUIRIES': inquiries,
        'EXISTING_LOAN_BALANCE': loan_balance
    })
    
    # 2. Risk Scoring & Credit Record Generation
    # Calculate a custom risk index for correlations
    risk_index = np.zeros(num_records)
    
    # Standardize Income contribution (higher income -> lower risk)
    income_std = (income - income.mean()) / income.std()
    risk_index -= income_std * 0.4
    
    # Inquiries (more inquiries -> higher risk)
    inquiries_std = (inquiries - inquiries.mean()) / inquiries.std()
    risk_index += inquiries_std * 0.5
    
    # Loan Balance to Income ratio contribution (higher ratio -> higher risk)
    ratio = loan_balance / (income + 1.0)
    ratio_std = (ratio - ratio.mean()) / (ratio.std() + 1e-5)
    risk_index += ratio_std * 0.4
    
    # Age contribution (younger -> higher risk)
    age_std = (age_years - age_years.mean()) / age_years.std()
    risk_index -= age_std * 0.2
    
    # Employment duration (pensioner or short employment -> higher risk)
    emp_years = np.where(days_employed == 365243, 0, -days_employed / 365.25)
    emp_std = (emp_years - emp_years.mean()) / emp_years.std()
    risk_index -= emp_std * 0.3
    
    # Education contribution
    edu_risk = {'Higher education': -0.3, 'Academic degree': -0.4, 'Incomplete higher': -0.1, 
                'Secondary / secondary special': 0.1, 'Lower secondary': 0.4}
    risk_index += np.array([edu_risk.get(e, 0.0) for e in education_types])
    
    # Sigmoid function to convert risk index to a probability
    risk_prob = 1 / (1 + np.exp(-(risk_index - 1.8))) # Offset to have ~10-15% default rate
    
    # Draw binary high risk status (Class 1) based on risk_prob
    is_high_risk = np.random.binomial(1, risk_prob)
    print(f"Target dataset risk distribution: {is_high_risk.sum()} high risk ({is_high_risk.sum()/num_records:.2%}), {num_records - is_high_risk.sum()} low risk.")
    
    # Generate Credit Record dataset
    # Each client has 12 to 24 months of history
    credit_records = []
    
    for idx, client_id in enumerate(ids):
        num_months = np.random.randint(12, 25)
        client_risk = is_high_risk[idx]
        
        # Payment codes: '0', '1', '2', '3', '4', '5', 'C', 'X'
        # '2', '3', '4', '5' represent high risk.
        # If client is high risk, they MUST have at least one month of status '2'-'5'
        # If client is low risk, they can ONLY have '0', '1', 'C', 'X'
        
        history_codes = []
        if client_risk == 1:
            # Decide which months are high-risk (e.g. 1 to 3 months)
            num_bad_months = np.random.randint(1, 4)
            bad_months = np.random.choice(range(num_months), size=num_bad_months, replace=False)
            
            for m in range(num_months):
                if m in bad_months:
                    history_codes.append(str(np.random.choice(['2', '3', '4', '5'], p=[0.5, 0.25, 0.15, 0.1])))
                else:
                    # Other months can be normal
                    history_codes.append(str(np.random.choice(['0', '1', 'C', 'X'], p=[0.4, 0.1, 0.4, 0.1])))
        else:
            # Low risk history (no '2'-'5')
            for m in range(num_months):
                history_codes.append(str(np.random.choice(['0', '1', 'C', 'X'], p=[0.3, 0.05, 0.5, 0.15])))
                
        for month_idx, code in enumerate(history_codes):
            # months balance runs backwards from 0 (current month)
            months_balance = -month_idx
            credit_records.append({
                'ID': client_id,
                'MONTHS_BALANCE': months_balance,
                'STATUS': code
            })
            
    df_credit = pd.DataFrame(credit_records)
    
    # Save files
    os.makedirs('data', exist_ok=True)
    df_app.to_csv('data/application_record.csv', index=False)
    df_credit.to_csv('data/credit_record.csv', index=False)
    print("Datasets successfully generated and saved to data/ directory.")

if __name__ == '__main__':
    generate_datasets()
