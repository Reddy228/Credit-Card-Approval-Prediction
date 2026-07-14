// ==============================================================================
// AURA Credit ML Frontend Logic
// Handles wizard forms, interactive dial scoring, AJAX charts, and logging consoles.
// ==============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Determine active page based on window location
    const path = window.location.pathname;

    // Load page-specific logic
    if (path === '/' || path === '/analyst') {
        initAnalystPortal();
    } else if (path === '/compliance') {
        initComplianceHub();
    } else if (path === '/self_service') {
        initEligibilityWizard();
    } else if (path === '/models') {
        initModelAnalytics();
    } else if (path === '/watson') {
        initWatsonOps();
    }
});

// ==============================================================================
// 1. Scenario 1: Credit Analyst Portal
// ==============================================================================
function initAnalystPortal() {
    const form = document.getElementById('screening-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Elements
        const placeholderView = document.getElementById('result-placeholder-view');
        const displayView = document.getElementById('result-display-view');
        const container = document.getElementById('result-card-container');
        
        // Show scanning state
        placeholderView.innerHTML = `
            <div class="scanner-container">
                <div class="scanner-circle">
                    <i class="fa-solid fa-microchip-ai fa-spin"></i>
                </div>
                <div class="scanner-line"></div>
            </div>
            <h3 class="text-blue mt-4">Running Scoring Engine...</h3>
            <p>Preprocessing demographics, applying standard scaler, and feeding payload to the neural decision pipeline...</p>
        `;
        placeholderView.classList.remove('hide');
        displayView.classList.add('hide');
        container.className = 'card glassmorphic shadow-neon border-blue flex-center-col';

        // Gather form data
        const formData = new FormData(form);
        const data = {};
        formData.forEach((value, key) => {
            // Convert numbers
            if (['AMT_INCOME_TOTAL', 'AGE_YEARS', 'EMPLOYMENT_DURATION_YEARS', 'CNT_CREDIT_INQUIRIES', 'EXISTING_LOAN_BALANCE'].includes(key)) {
                data[key] = parseFloat(value);
            } else {
                data[key] = value;
            }
        });

        // Add dummy car/realty values if not provided
        if (!data.hasOwnProperty('FLAG_OWN_CAR')) data['FLAG_OWN_CAR'] = 'N';
        if (!data.hasOwnProperty('FLAG_OWN_REALTY')) data['FLAG_OWN_REALTY'] = 'Y';

        try {
            // API Call
            const response = await fetch('/api/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();

            // Simulate minor delay for high-fidelity scanning effect
            setTimeout(() => {
                renderAnalystResult(result, data);
            }, 1000);

        } catch (error) {
            console.error('Error fetching prediction:', error);
            placeholderView.innerHTML = `
                <i class="fa-solid fa-triangle-exclamation text-red font-size-xl"></i>
                <h3 class="mt-4">API Error Occurred</h3>
                <p>Could not connect to model decision server. Ensure training is run and server is active.</p>
            `;
        }
    });
}

function renderAnalystResult(result, inputData) {
    const placeholderView = document.getElementById('result-placeholder-view');
    const displayView = document.getElementById('result-display-view');
    const container = document.getElementById('result-card-container');
    
    placeholderView.classList.add('hide');
    displayView.classList.remove('hide');

    const isApproved = result.approved;
    const confidencePercent = (result.confidence * 100).toFixed(1);

    // Update styling based on approval
    const badge = document.getElementById('decision-badge');
    const halo = document.getElementById('decision-halo');
    const title = document.getElementById('decision-title');
    const subtitle = document.getElementById('decision-subtitle');
    const fill = document.getElementById('decision-confidence-fill');
    const valText = document.getElementById('decision-confidence-val');

    valText.textContent = `${confidencePercent}%`;
    fill.style.width = `${confidencePercent}%`;

    if (isApproved) {
        container.className = 'card glassmorphic shadow-neon border-mint animate-fade-in';
        badge.className = 'decision-badge decision-approved';
        halo.className = 'decision-halo halo-approved';
        badge.innerHTML = '<i class="fa-solid fa-check"></i>';
        title.className = 'decision-title text-green';
        title.textContent = 'APPROVED';
        subtitle.textContent = 'Applicant matches compliance parameters.';
        fill.style.background = 'linear-gradient(90deg, var(--color-mint) 0%, #34d399 100%)';
        fill.style.boxShadow = '0 0 8px var(--color-mint-glow)';
    } else {
        container.className = 'card glassmorphic shadow-neon border-red animate-fade-in';
        badge.className = 'decision-badge decision-rejected';
        halo.className = 'decision-halo halo-rejected';
        badge.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        title.className = 'decision-title text-red';
        title.textContent = 'REJECTED';
        subtitle.textContent = 'Applicant represents elevated default risk.';
        fill.style.background = 'linear-gradient(90deg, var(--color-red) 0%, #f87171 100%)';
        fill.style.boxShadow = '0 0 8px var(--color-red-glow)';
    }

    // Render contributing risk factor alerts
    const factorsList = document.getElementById('risk-factors-list');
    factorsList.innerHTML = '';

    const factors = [];
    const debtRatio = inputData.EXISTING_LOAN_BALANCE / inputData.AMT_INCOME_TOTAL;

    if (inputData.CNT_CREDIT_INQUIRIES > 3) {
        factors.push({
            status: 'red',
            text: `High credit inquiries: ${inputData.CNT_CREDIT_INQUIRIES} requests in past months indicate active credit seeking.`
        });
    }
    if (debtRatio > 0.4) {
        factors.push({
            status: 'red',
            text: `Debt-to-Income is elevated (${(debtRatio*100).toFixed(0)}%). Debt levels exceed safe threshold.`
        });
    } else if (debtRatio > 0.15) {
        factors.push({
            status: 'yellow',
            text: `Moderate debt burden: ${(debtRatio*100).toFixed(0)}% of income allocated to debt.`
        });
    }
    if (inputData.EMPLOYMENT_DURATION_YEARS < 2 && inputData.NAME_INCOME_TYPE !== 'Pensioner') {
        factors.push({
            status: 'yellow',
            text: `Short employment tenure (${inputData.EMPLOYMENT_DURATION_YEARS} years) represents slight income risk.`
        });
    }
    if (inputData.NAME_EDUCATION_TYPE === 'Lower secondary') {
        factors.push({
            status: 'yellow',
            text: `Basic education profile is statistically correlated with higher delinquency margins.`
        });
    }
    if (inputData.AMT_INCOME_TOTAL < 45000) {
        factors.push({
            status: 'red',
            text: `Low annual income buffer ($${inputData.AMT_INCOME_TOTAL.toLocaleString()}) offers slim default cushion.`
        });
    }

    // If no risk factors triggered, add a positive one
    if (factors.length === 0) {
        factors.push({
            status: 'green',
            text: 'Excellent financial ratios: Healthy income margin, long employment, and zero recent credit searches.'
        });
    } else if (isApproved && factors.length > 0) {
        factors.push({
            status: 'green',
            text: 'Mitigating circumstances: High income or asset backing offsets minor inquiry flags.'
        });
    }

    factors.forEach(f => {
        const li = document.createElement('li');
        li.className = 'risk-factor-item';
        
        let bullet = '';
        if (f.status === 'red') bullet = '<i class="fa-solid fa-triangle-exclamation factor-bullet bullet-red"></i>';
        else if (f.status === 'yellow') bullet = '<i class="fa-solid fa-circle-exclamation factor-bullet bullet-yellow"></i>';
        else bullet = '<i class="fa-solid fa-circle-check factor-bullet bullet-green"></i>';

        li.innerHTML = `${bullet}<div>${f.text}</div>`;
        factorsList.appendChild(li);
    });
}

// ==============================================================================
// 2. Scenario 2: Risk & Compliance Hub
// ==============================================================================
let fullBatchData = [];

async function initComplianceHub() {
    const tbody = document.getElementById('compliance-tbody');
    if (!tbody) return;

    try {
        const response = await fetch('/api/batch');
        const batch = await response.json();
        fullBatchData = batch;
        
        // Render batch counts
        const total = batch.length;
        const highRisk = batch.filter(x => x.risk_flag === 1).length;
        const passRate = (((total - highRisk) / total) * 100).toFixed(1);

        document.getElementById('batch-total-count').textContent = total;
        document.getElementById('batch-high-risk-count').textContent = highRisk;
        document.getElementById('batch-pass-rate').textContent = `${passRate}%`;

        renderBatchTable(batch);

        // Set up search and filter handlers
        const searchInput = document.getElementById('compliance-search');
        const filterSelect = document.getElementById('compliance-filter');

        const applyFilter = () => {
            const query = searchInput.value.toLowerCase();
            const filter = filterSelect.value;

            const filtered = fullBatchData.filter(item => {
                const matchesSearch = item.id.toString().includes(query);
                const matchesRisk = filter === 'all' || 
                                   (filter === 'high' && item.risk_flag === 1) || 
                                   (filter === 'low' && item.risk_flag === 0);
                return matchesSearch && matchesRisk;
            });
            renderBatchTable(filtered);
        };

        searchInput.addEventListener('input', applyFilter);
        filterSelect.addEventListener('change', applyFilter);

        // Close timeline panel handler
        document.getElementById('close-timeline-panel').addEventListener('click', () => {
            document.getElementById('timeline-panel-overlay').classList.add('hide');
        });

    } catch (error) {
        console.error('Error fetching batch data:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-8 text-red">
                    <i class="fa-solid fa-circle-exclamation font-size-xl"></i>
                    <p class="mt-2">Failed to retrieve compliance records. Ensure data files are generated.</p>
                </td>
            </tr>
        `;
    }
}

function renderBatchTable(data) {
    const tbody = document.getElementById('compliance-tbody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-8 text-muted">
                    No matching records found in this batch.
                </td>
            </tr>
        `;
        return;
    }

    data.forEach(item => {
        const tr = document.createElement('tr');
        
        // Format status badges
        let badgeHtml = '<div class="history-flow-badges">';
        item.status_history.forEach(sh => {
            let badgeClass = 'flow-badge';
            if (sh.status === 'C') badgeClass += ' badge-c';
            else if (sh.status === 'X') badgeClass += ' badge-x';
            else if (sh.status === '0') badgeClass += ' badge-0';
            else if (sh.status === '1') badgeClass += ' badge-1';
            else badgeClass += ' badge-bad'; // '2', '3', '4', '5'

            badgeHtml += `<span class="${badgeClass}" onclick="openTimelinePanel(${item.id})" title="Month ${sh.month}: Status ${sh.status}">${sh.status}</span>`;
        });
        badgeHtml += '</div>';

        // Decision pill
        const decisionPill = item.risk_flag === 1 ? 
            `<span class="risk-pill pill-red"><i class="fa-solid fa-triangle-exclamation"></i> High Risk (Class 1)</span>` : 
            `<span class="risk-pill pill-green"><i class="fa-solid fa-circle-check"></i> Low Risk (Class 0)</span>`;

        tr.innerHTML = `
            <td><strong>${item.id}</strong></td>
            <td>
                <span class="font-size-sm">${item.gender === 'F' ? 'Female' : 'Male'}, ${item.age} yrs</span><br>
                <span class="text-muted font-size-sm">${item.education}</span>
            </td>
            <td>$${item.income.toLocaleString()}</td>
            <td>${item.inquiries}</td>
            <td>$${item.loan_balance.toLocaleString()}</td>
            <td>${badgeHtml}</td>
            <td>${decisionPill}</td>
        `;
        tbody.appendChild(tr);
    });
}

function openTimelinePanel(applicantId) {
    const item = fullBatchData.find(x => x.id === applicantId);
    if (!item) return;

    const panelBody = document.getElementById('timeline-panel-body');
    const overlay = document.getElementById('timeline-panel-overlay');

    // Build timeline view
    let timelineHtml = `
        <div class="devops-info-grid mb-6">
            <div class="info-row">
                <span class="info-label">Applicant ID</span>
                <span class="info-value font-bold">${item.id}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Aggregated Status</span>
                <span class="info-value">${item.risk_flag === 1 ? '<span class="text-red">High-Risk Delinquency</span>' : '<span class="text-green">Compliant Account</span>'}</span>
            </div>
        </div>
        <div class="timeline-list">
    `;

    item.status_history.forEach(sh => {
        const isBad = ['2', '3', '4', '5'].includes(sh.status);
        const bulletClass = isBad ? 'bullet-trigger-red' : 'bullet-normal-blue';
        
        let title = '';
        let desc = '';
        if (sh.status === 'C') {
            title = 'Account Fully Paid Off';
            desc = 'No outstanding balance on credit account for this month.';
        } else if (sh.status === 'X') {
            title = 'No Debt Active';
            desc = 'Customer holds active card but maintains zero credit balance.';
        } else if (sh.status === '0') {
            title = 'Paid on Time (1-29 days)';
            desc = 'Standard compliant transaction. Payment received within standard grace window.';
        } else if (sh.status === '1') {
            title = 'Minor Delay (30-59 days)';
            desc = 'Payment slightly overdue. Standard monitoring flag activated.';
        } else {
            const daysMap = { '2': '60-89', '3': '90-119', '4': '120-149', '5': '150+' };
            title = `CRITICAL DELINQUENCY (Status ${sh.status})`;
            desc = `Severe default trigger: Payment is ${daysMap[sh.status] || '150+'} days overdue. Automapped to Binary Risk Flag Class 1.`;
        }

        timelineHtml += `
            <div class="timeline-node">
                <span class="timeline-bullet ${bulletClass}"></span>
                <div class="timeline-content">
                    <span class="timeline-date">Month ${sh.month} (${sh.month === 0 ? 'Current' : sh.month + ' months ago'})</span>
                    <h4 class="timeline-title ${isBad ? 'text-red' : ''}">${title}</h4>
                    <p class="timeline-desc">${desc}</p>
                </div>
            </div>
        `;
    });

    timelineHtml += '</div>';
    panelBody.innerHTML = timelineHtml;
    overlay.classList.remove('hide');
}

// ==============================================================================
// 3. Scenario 4: Customer Self-Service Eligibility Check
// ==============================================================================
let wizardStep = 1;

function initEligibilityWizard() {
    const form = document.getElementById('wizard-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Show spinner inside speedometer
        document.getElementById('gauge-score').textContent = '...';
        document.getElementById('gauge-label').textContent = 'Analyzing';
        document.getElementById('gauge-fill-path').style.strokeDashoffset = '351.8';

        const formData = new FormData(form);
        const data = {};
        formData.forEach((value, key) => {
            if (['AMT_INCOME_TOTAL', 'AGE_YEARS', 'EMPLOYMENT_DURATION_YEARS', 'CNT_CREDIT_INQUIRIES', 'EXISTING_LOAN_BALANCE'].includes(key)) {
                data[key] = parseFloat(value);
            } else {
                data[key] = value;
            }
        });

        try {
            const response = await fetch('/api/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await response.json();

            // Render eligibility gauge
            setTimeout(() => {
                renderEligibilityResult(result, data);
            }, 1000);

        } catch (error) {
            console.error('Error fetching prediction:', error);
            document.getElementById('gauge-score').textContent = 'ERR';
            document.getElementById('gauge-label').textContent = 'Server Error';
        }
    });
}

function renderEligibilityResult(result, inputData) {
    const scoreText = document.getElementById('gauge-score');
    const labelText = document.getElementById('gauge-label');
    const fillPath = document.getElementById('gauge-fill-path');
    const resultsTextBox = document.getElementById('eligibility-results-text');
    const tipsBox = document.getElementById('eligibility-tips-box');
    const tipsList = document.getElementById('eligibility-tips-list');

    // Calculate probability
    // result.approved: true/false. result.confidence is between 0.5 and 1.0.
    // If approved, probability is result.confidence. If rejected, probability is 1.0 - result.confidence
    let probability = result.approved ? result.confidence : (1.0 - result.confidence);
    
    // Convert to percentage
    const percent = Math.round(probability * 100);
    scoreText.textContent = `${percent}%`;

    // Animate Speedometer Arc (circumference = 351.8)
    const strokeOffset = 351.8 - (percent / 100 * 351.8);
    fillPath.style.strokeDashoffset = strokeOffset;

    // Update color and text labels
    let color = '';
    let category = '';
    let categoryDesc = '';
    let borderTheme = '';

    if (percent >= 75) {
        color = 'var(--color-mint)';
        category = 'Excellent';
        categoryDesc = 'You have a very high likelihood of credit approval! Your financial buffers look solid.';
        labelText.style.color = 'var(--color-mint)';
        borderTheme = 'card glassmorphic shadow-neon border-mint flex-center-col p-8 text-center animate-fade-in';
    } else if (percent >= 50) {
        color = 'var(--color-yellow)';
        category = 'Fair / Moderate';
        categoryDesc = 'Moderate chance of approval. You meet some conditions, but some risks are flagged.';
        labelText.style.color = 'var(--color-yellow)';
        borderTheme = 'card glassmorphic shadow-neon border-dim flex-center-col p-8 text-center animate-fade-in';
    } else {
        color = 'var(--color-red)';
        category = 'High Risk Threshold';
        categoryDesc = 'Approval likelihood is low. We suggest reviewing the criteria below to build credit.';
        labelText.style.color = 'var(--color-red)';
        borderTheme = 'card glassmorphic shadow-neon border-red flex-center-col p-8 text-center animate-fade-in';
    }

    fillPath.style.stroke = color;
    labelText.textContent = category;
    
    // Update main wrapper styling
    document.getElementById('eligibility-output-card').className = borderTheme;

    // Update explanations
    resultsTextBox.innerHTML = `
        <h3 style="color: ${color}">${category} Eligibility</h3>
        <p class="text-muted mt-2">${categoryDesc}</p>
    `;

    // Populate customized recommendations
    tipsList.innerHTML = '';
    const tips = [];
    const debtRatio = inputData.EXISTING_LOAN_BALANCE / inputData.AMT_INCOME_TOTAL;

    if (inputData.CNT_CREDIT_INQUIRIES > 3) {
        tips.push('Avoid applying for new credit accounts or cards for at least 6 months. Inquiries trigger credit checks.');
    }
    if (debtRatio > 0.3) {
        tips.push('Focus on paying down your current debts first. Aim to bring your total debt ratio below 30% of income.');
    }
    if (inputData.EMPLOYMENT_DURATION_YEARS < 2) {
        tips.push('Stay with your current employer longer. Lenders seek continuous, stable income streams of 2+ years.');
    }
    if (inputData.AMT_INCOME_TOTAL < 45000) {
        tips.push('If possible, declare secondary income streams or include a family co-signer to bolster the application.');
    }
    if (tips.length === 0) {
        tips.push('Maintain your current habits! Pay all utility and loan balances on time to safeguard your standing.');
    }

    tips.forEach(t => {
        const li = document.createElement('li');
        li.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>${t}</span>`;
        tipsList.appendChild(li);
    });

    tipsBox.classList.remove('hide');
}

// Navigation for customer wizard
window.nextWizardStep = function(step) {
    // Validate current inputs
    const currentStepDiv = document.getElementById(`wizard-step-${step - 1}`);
    const inputs = currentStepDiv.querySelectorAll('input, select');
    let valid = true;
    inputs.forEach(i => {
        if (!i.checkValidity()) {
            i.reportValidity();
            valid = false;
        }
    });
    if (!valid) return;

    // Transition steps
    document.getElementById(`wizard-step-${step - 1}`).classList.remove('active');
    document.getElementById(`wizard-step-${step}`).classList.add('active');

    // Stepper indicators
    document.getElementById(`step-ind-${step - 1}`).classList.remove('active');
    document.getElementById(`step-ind-${step - 1}`).classList.add('complete');
    document.getElementById(`step-ind-${step}`).classList.add('active');
    document.getElementById(`step-line-${step - 1}`).classList.add('complete');

    wizardStep = step;
};

window.prevWizardStep = function(step) {
    // Transition steps
    document.getElementById(`wizard-step-${step + 1}`).classList.remove('active');
    document.getElementById(`wizard-step-${step}`).classList.add('active');

    // Stepper indicators
    document.getElementById(`step-ind-${step + 1}`).classList.remove('active');
    document.getElementById(`step-ind-${step}`).classList.remove('complete');
    document.getElementById(`step-ind-${step}`).classList.add('active');
    document.getElementById(`step-line-${step}`).classList.remove('complete');

    wizardStep = step;
};

// ==============================================================================
// 4. Model Performance Dashboard Analytics
// ==============================================================================
async function initModelAnalytics() {
    const tableBody = document.getElementById('metrics-table-body');
    if (!tableBody) return;

    try {
        const response = await fetch('/api/metrics');
        const data = await response.json();
        
        // Populate Table
        tableBody.innerHTML = '';
        const metrics = data.metrics;
        
        for (const [modelName, info] of Object.entries(metrics)) {
            const isBest = modelName === data.best_model;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${modelName}</strong></td>
                <td>${(info.accuracy * 100).toFixed(2)}%</td>
                <td>${(info.precision * 100).toFixed(2)}%</td>
                <td>${(info.recall * 100).toFixed(2)}%</td>
                <td>${(info.f1_score * 100).toFixed(2)}%</td>
                <td>${(info.roc_auc).toFixed(4)}</td>
                <td>
                    ${isBest ? 
                        `<span class="risk-pill pill-green"><i class="fa-solid fa-award"></i> Best Model</span>` : 
                        `<span class="risk-pill pill-green" style="opacity: 0.5;">Candidate</span>`
                    }
                </td>
            `;
            tableBody.appendChild(tr);
        }

        // Render Chart 1: Model Comparison
        const chartLabels = Object.keys(metrics);
        const accuracies = chartLabels.map(m => (metrics[m].accuracy * 100).toFixed(1));
        const precisions = chartLabels.map(m => (metrics[m].precision * 100).toFixed(1));
        const recalls = chartLabels.map(m => (metrics[m].recall * 100).toFixed(1));
        const f1Scores = chartLabels.map(m => (metrics[m].f1_score * 100).toFixed(1));

        const ctx1 = document.getElementById('metrics-comparison-chart').getContext('2d');
        new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: chartLabels,
                datasets: [
                    { label: 'Accuracy', data: accuracies, backgroundColor: 'rgba(59, 130, 246, 0.75)', borderColor: 'var(--color-blue)', borderWidth: 1 },
                    { label: 'Precision', data: precisions, backgroundColor: 'rgba(16, 185, 129, 0.75)', borderColor: 'var(--color-mint)', borderWidth: 1 },
                    { label: 'Recall', data: recalls, backgroundColor: 'rgba(245, 158, 11, 0.75)', borderColor: 'var(--color-yellow)', borderWidth: 1 },
                    { label: 'F1-Score', data: f1Scores, backgroundColor: 'rgba(168, 85, 247, 0.75)', borderColor: '#a855f7', borderWidth: 1 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: '#f3f4f6', font: { family: 'Plus Jakarta Sans' } } }
                },
                scales: {
                    x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } },
                    y: { min: 0, max: 100, grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } }
                }
            }
        });

        // Render Chart 2: Feature Importance (best model)
        // Find best model metrics importance
        const bestModelName = data.best_model;
        const importanceData = metrics[bestModelName].feature_importances;
        
        let featureLabels = [];
        let featureWeights = [];

        if (importanceData && Object.keys(importanceData).length > 0) {
            // Sort features by absolute importance value
            const sortedFeatures = Object.entries(importanceData)
                .map(([name, weight]) => ({ name, val: Math.abs(weight) }))
                .sort((a, b) => b.val - a.val)
                .slice(0, 10); // Display top 10 features

            featureLabels = sortedFeatures.map(f => {
                // Map column names to friendly readable strings
                const nameMap = {
                    'AMT_INCOME_TOTAL': 'Annual Income',
                    'DAYS_BIRTH': 'Applicant Age',
                    'DAYS_EMPLOYED': 'Employment Duration',
                    'CNT_CREDIT_INQUIRIES': 'Credit Inquiries',
                    'EXISTING_LOAN_BALANCE': 'Existing Loan Balance',
                    'CODE_GENDER_M': 'Gender (Male)',
                    'CODE_GENDER_F': 'Gender (Female)',
                    'FLAG_OWN_CAR_Y': 'Owns Car',
                    'FLAG_OWN_CAR_N': 'No Car',
                    'FLAG_OWN_REALTY_Y': 'Owns Property',
                    'FLAG_OWN_REALTY_N': 'No Property'
                };
                if (nameMap[f.name]) return nameMap[f.name];
                return f.name.replace(/_/g, ' ').substring(0, 22);
            });
            featureWeights = sortedFeatures.map(f => f.val);
        } else {
            // Fallback features list
            featureLabels = ['Existing Loan Balance', 'Credit Inquiries', 'Employment Duration', 'Annual Income', 'Applicant Age', 'Housing Type', 'Education Level'];
            featureWeights = [0.38, 0.28, 0.16, 0.09, 0.06, 0.02, 0.01];
        }

        const ctx2 = document.getElementById('feature-importance-chart').getContext('2d');
        new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: featureLabels,
                datasets: [{
                    label: 'Relative Weight',
                    data: featureWeights,
                    backgroundColor: 'rgba(16, 185, 129, 0.75)',
                    borderColor: 'var(--color-mint)',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } },
                    y: { grid: { display: false }, ticks: { color: '#9ca3af', font: { family: 'Plus Jakarta Sans' } } }
                }
            }
        });

    } catch (error) {
        console.error('Error rendering model analytics:', error);
    }
}

// ==============================================================================
// 5. Watson ML Console Simulator
// ==============================================================================
function initWatsonOps() {
    const logsContainer = document.getElementById('wml-console-logs');
    if (!logsContainer) return;

    // Simulate logs activity scrolling by
    const applicantsPool = [5001292, 5003441, 5000021, 5004812, 5002998];
    const logStates = ['APPROVED', 'REJECTED'];

    setInterval(() => {
        const timestamp = new Date().toTimeString().split(' ')[0];
        const randomId = applicantsPool[Math.floor(Math.random() * applicantsPool.length)];
        const decision = logStates[Math.floor(Math.random() * logStates.length)];
        
        let decisionHtml = decision === 'APPROVED' ? 
            `<span class="log-success">APPROVED</span>` : 
            `<span class="log-warning">REJECTED</span>`;

        const logs = [
            `<div class="log-entry"><span class="log-ts">[${timestamp}]</span> <span class="log-info">INFO</span> Received POST /predictions score request from client IP 169.46.12.18</div>`,
            `<div class="log-entry"><span class="log-ts">[${timestamp}]</span> <span class="log-info">INFO</span> Scoring payload size: 1 applicant record (ID: ${randomId}). Model status: online.</div>`,
            `<div class="log-entry"><span class="log-ts">[${timestamp}]</span> <span class="log-info">INFO</span> Preprocessing execution completed in 12ms. Running inference pipeline.</div>`,
            `<div class="log-entry"><span class="log-ts">[${timestamp}]</span> <span class="log-info">INFO</span> Classifier prediction: Class ${decision === 'APPROVED' ? 0 : 1} - Decision output: ${decisionHtml} (Confidence: ${(Math.random() * 20 + 80).toFixed(1)}%).</div>`
        ];

        // Append one log block
        logs.forEach(logLine => {
            const temp = document.createElement('div');
            temp.innerHTML = logLine;
            logsContainer.appendChild(temp.firstElementChild);
        });

        // Scroll to bottom
        logsContainer.scrollTop = logsContainer.scrollHeight;

        // Clean older logs
        while (logsContainer.children.length > 50) {
            logsContainer.removeChild(logsContainer.firstElementChild);
        }

    }, 5000);
}

// Tab switcher for coding snippets
window.switchSnippetTab = function(type) {
    const curlTab = document.getElementById('snippet-curl');
    const pyTab = document.getElementById('snippet-python');
    const tabs = document.querySelectorAll('.tabs-control .tab-btn');

    if (type === 'curl') {
        curlTab.classList.remove('hide');
        pyTab.classList.add('hide');
        tabs[0].classList.add('active');
        tabs[1].classList.remove('active');
    } else {
        curlTab.classList.add('hide');
        pyTab.classList.remove('hide');
        tabs[0].classList.remove('active');
        tabs[1].classList.add('active');
    }
};
