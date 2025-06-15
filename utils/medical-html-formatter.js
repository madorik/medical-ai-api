const { 
  MEDICAL_DOCUMENT_CATEGORIES,
  CATEGORY_NAMES_KR 
} = require('./medical-document-categories');

/**
 * 카테고리별 맞춤형 HTML 템플릿 생성 (스타일 없음)
 */
function formatAnalysisToHTML(analysisText, category, categoryInfo) {
  try {
    // JSON 파싱 시도
    let parsedData;
    try {
      parsedData = JSON.parse(analysisText);
    } catch (e) {
      // JSON 파싱 실패 시 기본 HTML 반환
      return createBasicHTML(analysisText, categoryInfo);
    }

    // 카테고리별 HTML 생성
    switch (category) {
      case MEDICAL_DOCUMENT_CATEGORIES.prescription:
        return createPrescriptionHTML(parsedData, categoryInfo);
      
      case MEDICAL_DOCUMENT_CATEGORIES.pharmacy_receipt:
        return createPharmacyReceiptHTML(parsedData, categoryInfo);
      
      case MEDICAL_DOCUMENT_CATEGORIES.lab_result:
        return createLabResultHTML(parsedData, categoryInfo);
      
      case MEDICAL_DOCUMENT_CATEGORIES.health_checkup:
        return createHealthCheckupHTML(parsedData, categoryInfo);
      
      case MEDICAL_DOCUMENT_CATEGORIES.hospital_bill:
        return createHospitalBillHTML(parsedData, categoryInfo);
      
      case MEDICAL_DOCUMENT_CATEGORIES.medical_record:
        return createMedicalRecordHTML(parsedData, categoryInfo);
      
      default:
        return createBasicHTML(analysisText, categoryInfo);
    }
  } catch (error) {
    console.error('HTML 변환 중 오류:', error);
    return createBasicHTML(analysisText, categoryInfo);
  }
}

/**
 * 처방전 HTML 템플릿
 */
function createPrescriptionHTML(data, categoryInfo) {
  const medications = data.medications || [];
  
  return `
    <div class="medical-analysis-result prescription-result">
      <div class="category-header">
        <span class="category-icon">${categoryInfo.icon}</span>
        <h2 class="category-title">${categoryInfo.name} 분석 결과</h2>
      </div>
      
      ${data.patient_info ? `
        <div class="section patient-info">
          <h3>환자 정보</h3>
          <div class="info-grid">
            ${data.patient_info.name ? `<div class="info-item"><strong>이름:</strong> ${data.patient_info.name}</div>` : ''}
            ${data.patient_info.age ? `<div class="info-item"><strong>나이:</strong> ${data.patient_info.age}세</div>` : ''}
          </div>
        </div>
      ` : ''}
      
      ${data.prescription_info ? `
        <div class="section prescription-info">
          <h3>처방 정보</h3>
          <div class="info-grid">
            ${data.prescription_info.prescription_date ? `<div class="info-item"><strong>처방일:</strong> ${data.prescription_info.prescription_date}</div>` : ''}
            ${data.prescription_info.hospital_name ? `<div class="info-item"><strong>병원명:</strong> ${data.prescription_info.hospital_name}</div>` : ''}
            ${data.prescription_info.doctor_name ? `<div class="info-item"><strong>처방의:</strong> ${data.prescription_info.doctor_name}</div>` : ''}
          </div>
        </div>
      ` : ''}
      
      ${medications.length > 0 ? `
        <div class="section medications">
          <h3>처방 약물 (${medications.length}개)</h3>
          <div class="medications-grid">
            ${medications.map(med => `
              <div class="medication-card">
                <div class="med-name">${med.name || '약물명 미상'}</div>
                ${med.dosage ? `<div class="med-dosage"><strong>용법:</strong> ${med.dosage}</div>` : ''}
                ${med.purpose ? `<div class="med-purpose"><strong>목적:</strong> ${med.purpose}</div>` : ''}
                ${med.side_effects ? `<div class="med-side-effects"><strong>부작용:</strong> ${med.side_effects}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      ${data.detailed_analysis ? `
        <div class="section analysis">
          <h3>상세 분석</h3>
          <div class="analysis-content">${formatTextWithLineBreaks(data.detailed_analysis)}</div>
        </div>
      ` : ''}
      
      ${data.drug_interactions ? `
        <div class="section warning">
          <h3>⚠️ 약물 상호작용</h3>
          <div class="warning-content">${formatTextWithLineBreaks(data.drug_interactions)}</div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * 약국 영수증 HTML 템플릿
 */
function createPharmacyReceiptHTML(data, categoryInfo) {
  const medications = data.medications || [];
  
  return `
    <div class="medical-analysis-result pharmacy-receipt-result">
      <div class="category-header">
        <span class="category-icon">${categoryInfo.icon}</span>
        <h2 class="category-title">${categoryInfo.name} 분석 결과</h2>
      </div>
      
      ${data.receipt_info ? `
        <div class="section receipt-info">
          <h3>영수증 정보</h3>
          <div class="info-grid">
            ${data.receipt_info.pharmacy_name ? `<div class="info-item"><strong>약국명:</strong> ${data.receipt_info.pharmacy_name}</div>` : ''}
            ${data.receipt_info.receipt_date ? `<div class="info-item"><strong>조제일:</strong> ${data.receipt_info.receipt_date}</div>` : ''}
            ${data.receipt_info.pharmacist_name ? `<div class="info-item"><strong>약사:</strong> ${data.receipt_info.pharmacist_name}</div>` : ''}
          </div>
        </div>
      ` : ''}
      
      ${medications.length > 0 ? `
        <div class="section medications-cost">
          <h3>조제 약물 및 비용</h3>
          <table class="cost-table">
            <thead>
              <tr>
                <th>약물명</th>
                <th>수량</th>
                <th>단가</th>
                <th>금액</th>
              </tr>
            </thead>
            <tbody>
              ${medications.map(med => `
                <tr>
                  <td>${med.name || '약물명 미상'}</td>
                  <td>${med.quantity || '-'}</td>
                  <td>${med.unit_price ? formatCurrency(med.unit_price) : '-'}</td>
                  <td>${med.total_price ? formatCurrency(med.total_price) : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
      
      ${data.cost_summary ? `
        <div class="section cost-summary">
          <h3>비용 요약</h3>
          <div class="cost-summary-grid">
            ${data.cost_summary.total_amount ? `<div class="cost-item"><strong>총 금액:</strong> ${formatCurrency(data.cost_summary.total_amount)}</div>` : ''}
            ${data.cost_summary.insurance_amount ? `<div class="cost-item"><strong>보험 적용:</strong> ${formatCurrency(data.cost_summary.insurance_amount)}</div>` : ''}
            ${data.cost_summary.patient_payment ? `<div class="cost-item"><strong>본인부담:</strong> ${formatCurrency(data.cost_summary.patient_payment)}</div>` : ''}
          </div>
        </div>
      ` : ''}
      
      ${data.detailed_analysis ? `
        <div class="section analysis">
          <h3>비용 분석</h3>
          <div class="analysis-content">${formatTextWithLineBreaks(data.detailed_analysis)}</div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * 검사결과 HTML 템플릿
 */
function createLabResultHTML(data, categoryInfo) {
  const testResults = data.test_results || [];
  const abnormalResults = data.abnormal_results || [];
  
  return `
    <div class="medical-analysis-result lab-result-result">
      <div class="category-header">
        <span class="category-icon">${categoryInfo.icon}</span>
        <h2 class="category-title">${categoryInfo.name} 분석 결과</h2>
      </div>
      
      ${data.test_info ? `
        <div class="section test-info">
          <h3>검사 정보</h3>
          <div class="info-grid">
            ${data.test_info.test_date ? `<div class="info-item"><strong>검사일:</strong> ${data.test_info.test_date}</div>` : ''}
            ${data.test_info.hospital_name ? `<div class="info-item"><strong>검사기관:</strong> ${data.test_info.hospital_name}</div>` : ''}
            ${data.test_info.test_type ? `<div class="info-item"><strong>검사종류:</strong> ${data.test_info.test_type}</div>` : ''}
          </div>
        </div>
      ` : ''}
      
      ${abnormalResults.length > 0 ? `
        <div class="section abnormal-results">
          <h3>⚠️ 주의 필요 항목 (${abnormalResults.length}개)</h3>
          <div class="test-results-grid">
            ${abnormalResults.map(result => `
              <div class="test-result-card abnormal">
                <div class="test-name"><strong>${result.test_name}</strong></div>
                <div class="test-value">
                  <strong>결과:</strong> ${result.result_value}
                  ${result.normal_range ? `<br><small>(정상: ${result.normal_range})</small>` : ''}
                </div>
                ${result.clinical_significance ? `<div class="significance">${result.clinical_significance}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      ${testResults.length > 0 ? `
        <div class="section all-results">
          <h3>전체 검사 결과 (${testResults.length}개)</h3>
          <table class="test-table">
            <thead>
              <tr>
                <th>검사항목</th>
                <th>결과</th>
                <th>정상범위</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              ${testResults.map(result => `
                <tr>
                  <td>${result.test_name}</td>
                  <td>${result.result_value} ${result.unit || ''}</td>
                  <td>${result.normal_range || '-'}</td>
                  <td>${getStatusText(result.status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
      
      ${data.detailed_analysis ? `
        <div class="section analysis">
          <h3>상세 분석</h3>
          <div class="analysis-content">${formatTextWithLineBreaks(data.detailed_analysis)}</div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * 건강검진 HTML 템플릿
 */
function createHealthCheckupHTML(data, categoryInfo) {
  return `
    <div class="medical-analysis-result health-checkup-result">
      <div class="category-header">
        <span class="category-icon">${categoryInfo.icon}</span>
        <h2 class="category-title">${categoryInfo.name} 분석 결과</h2>
      </div>
      
      ${data.vital_signs ? `
        <div class="section vital-signs">
          <h3>기본 신체 정보</h3>
          <div class="vital-grid">
            ${data.vital_signs.height ? `<div class="vital-item"><strong>신장:</strong> ${data.vital_signs.height}</div>` : ''}
            ${data.vital_signs.weight ? `<div class="vital-item"><strong>체중:</strong> ${data.vital_signs.weight}</div>` : ''}
            ${data.vital_signs.bmi ? `<div class="vital-item"><strong>BMI:</strong> ${data.vital_signs.bmi}</div>` : ''}
            ${data.vital_signs.blood_pressure ? `<div class="vital-item"><strong>혈압:</strong> ${data.vital_signs.blood_pressure}</div>` : ''}
          </div>
        </div>
      ` : ''}
      
      ${data.overall_assessment ? `
        <div class="section assessment">
          <h3>종합 소견</h3>
          <div class="assessment-content">${formatTextWithLineBreaks(data.overall_assessment)}</div>
        </div>
      ` : ''}
      
      ${data.risk_factors && data.risk_factors.length > 0 ? `
        <div class="section risk-factors">
          <h3>⚠️ 위험 요인</h3>
          <ul class="risk-list">
            ${data.risk_factors.map(risk => `<li>${risk}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${data.detailed_analysis ? `
        <div class="section analysis">
          <h3>상세 분석</h3>
          <div class="analysis-content">${formatTextWithLineBreaks(data.detailed_analysis)}</div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * 병원 영수증 HTML 템플릿
 */
function createHospitalBillHTML(data, categoryInfo) {
  return `
    <div class="medical-analysis-result hospital-bill-result">
      <div class="category-header">
        <span class="category-icon">${categoryInfo.icon}</span>
        <h2 class="category-title">${categoryInfo.name} 분석 결과</h2>
      </div>
      
      ${data.cost_summary ? `
        <div class="section cost-overview">
          <h3>진료비 요약</h3>
          <div class="cost-overview-grid">
            ${data.cost_summary.total_medical_cost ? `<div class="cost-item"><strong>총 진료비:</strong> ${formatCurrency(data.cost_summary.total_medical_cost)}</div>` : ''}
            ${data.cost_summary.insurance_amount ? `<div class="cost-item"><strong>보험 적용:</strong> ${formatCurrency(data.cost_summary.insurance_amount)}</div>` : ''}
            ${data.cost_summary.final_payment ? `<div class="cost-item"><strong>최종 납부:</strong> ${formatCurrency(data.cost_summary.final_payment)}</div>` : ''}
          </div>
        </div>
      ` : ''}
      
      ${data.detailed_analysis ? `
        <div class="section analysis">
          <h3>비용 분석</h3>
          <div class="analysis-content">${formatTextWithLineBreaks(data.detailed_analysis)}</div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * 진료기록 HTML 템플릿
 */
function createMedicalRecordHTML(data, categoryInfo) {
  const prescribedDrugs = data.prescribed_drugs || [];
  
  return `
    <div class="medical-analysis-result medical-record-result">
      <div class="category-header">
        <span class="category-icon">${categoryInfo.icon}</span>
        <h2 class="category-title">${categoryInfo.name} 분석 결과</h2>
      </div>
      
      ${data.diagnosis ? `
        <div class="section diagnosis">
          <h3>진단명</h3>
          <div class="diagnosis-content">${data.diagnosis}</div>
        </div>
      ` : ''}
      
      ${data.main_symptoms ? `
        <div class="section symptoms">
          <h3>주요 증상</h3>
          <div class="symptoms-content">${formatTextWithLineBreaks(data.main_symptoms)}</div>
        </div>
      ` : ''}
      
      ${prescribedDrugs.length > 0 ? `
        <div class="section medications">
          <h3>처방 약물</h3>
          <div class="medications-grid">
            ${prescribedDrugs.map(drug => `
              <div class="medication-card">
                <div class="drug-name"><strong>${drug.name}</strong></div>
                ${drug.dosage ? `<div class="drug-dosage">${drug.dosage}</div>` : ''}
                ${drug.purpose ? `<div class="drug-purpose">${drug.purpose}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
      
      ${data.detailed_analysis ? `
        <div class="section analysis">
          <h3>상세 분석</h3>
          <div class="analysis-content">${formatTextWithLineBreaks(data.detailed_analysis)}</div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * 기본 HTML 템플릿 (JSON 파싱 실패 시)
 */
function createBasicHTML(text, categoryInfo) {
  return `
    <div class="medical-analysis-result basic-result">
      <div class="category-header">
        <span class="category-icon">${categoryInfo.icon}</span>
        <h2 class="category-title">${categoryInfo.name} 분석 결과</h2>
      </div>
      
      <div class="section analysis">
        <div class="analysis-content">${formatTextWithLineBreaks(text)}</div>
      </div>
    </div>
  `;
}

/**
 * 헬퍼 함수들
 */
function formatTextWithLineBreaks(text) {
  if (!text) return '';
  return text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function formatCurrency(amount) {
  if (typeof amount !== 'number') return amount;
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW'
  }).format(amount);
}

function getStatusText(status) {
  if (!status) return '-';
  switch (status.toLowerCase()) {
    case 'high': return '높음';
    case 'low': return '낮음';
    case 'abnormal': return '이상';
    case 'normal': return '정상';
    default: return status;
  }
}

module.exports = {
  formatAnalysisToHTML
}; 