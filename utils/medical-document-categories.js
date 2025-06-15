/**
 * 의료 문서 카테고리 정의 및 분석 스키마
 */

// 의료 문서 카테고리 enum
const MEDICAL_DOCUMENT_CATEGORIES = {
  // 진료 관련
  medical_record: 'medical_record',           // 진료기록/차트
  diagnosis_report: 'diagnosis_report',       // 진단서
  medical_opinion: 'medical_opinion',         // 소견서
  referral_letter: 'referral_letter',         // 의뢰서/회송서
  
  // 처방 관련  
  prescription: 'prescription',               // 처방전
  medication_guide: 'medication_guide',       // 복약지도서
  pharmacy_receipt: 'pharmacy_receipt',       // 약국 영수증/계산서
  
  // 검사/검진 관련
  lab_result: 'lab_result',                   // 혈액/소변 등 검사결과
  imaging_result: 'imaging_result',           // 영상검사 (CT, MRI, X-ray 등)
  health_checkup: 'health_checkup',           // 건강검진 결과
  pathology_report: 'pathology_report',       // 병리검사 보고서
  
  // 비용/행정 관련
  hospital_bill: 'hospital_bill',             // 병원 진료비 영수증
  insurance_claim: 'insurance_claim',         // 보험청구서
  medical_certificate: 'medical_certificate', // 진료확인서
  
  // 특수 목적
  vaccination_record: 'vaccination_record',   // 예방접종 증명서
  disability_assessment: 'disability_assessment', // 장애진단서
  fitness_certificate: 'fitness_certificate', // 건강진단서
  discharge_summary: 'discharge_summary',     // 퇴원요약서
  
  // 기타
  other: 'other'                              // 기타 의료 관련 문서
};

// 카테고리별 한국어 이름
const CATEGORY_NAMES_KR = {
  [MEDICAL_DOCUMENT_CATEGORIES.medical_record]: '진료기록',
  [MEDICAL_DOCUMENT_CATEGORIES.diagnosis_report]: '진단서',
  [MEDICAL_DOCUMENT_CATEGORIES.medical_opinion]: '소견서',
  [MEDICAL_DOCUMENT_CATEGORIES.referral_letter]: '의뢰서/회송서',
  [MEDICAL_DOCUMENT_CATEGORIES.prescription]: '처방전',
  [MEDICAL_DOCUMENT_CATEGORIES.medication_guide]: '복약지도서',
  [MEDICAL_DOCUMENT_CATEGORIES.pharmacy_receipt]: '약국 영수증/계산서',
  [MEDICAL_DOCUMENT_CATEGORIES.lab_result]: '검사결과',
  [MEDICAL_DOCUMENT_CATEGORIES.imaging_result]: '영상검사',
  [MEDICAL_DOCUMENT_CATEGORIES.health_checkup]: '건강검진',
  [MEDICAL_DOCUMENT_CATEGORIES.pathology_report]: '병리검사',
  [MEDICAL_DOCUMENT_CATEGORIES.hospital_bill]: '병원 영수증',
  [MEDICAL_DOCUMENT_CATEGORIES.insurance_claim]: '보험청구서',
  [MEDICAL_DOCUMENT_CATEGORIES.medical_certificate]: '진료확인서',
  [MEDICAL_DOCUMENT_CATEGORIES.vaccination_record]: '예방접종 증명서',
  [MEDICAL_DOCUMENT_CATEGORIES.disability_assessment]: '장애진단서',
  [MEDICAL_DOCUMENT_CATEGORIES.fitness_certificate]: '건강진단서',
  [MEDICAL_DOCUMENT_CATEGORIES.discharge_summary]: '퇴원요약서',
  [MEDICAL_DOCUMENT_CATEGORIES.other]: '기타'
};

// 카테고리별 분석 스키마 정의
const CATEGORY_SCHEMAS = {
  // 진료기록 스키마 (기존)
  [MEDICAL_DOCUMENT_CATEGORIES.medical_record]: {
    patient_info: {
      name: "string",
      age: "number",
      gender: "string",
      patient_id: "string"
    },
    visit_info: {
      visit_date: "string",
      department: "string",
      doctor_name: "string"
    },
    diagnosis: "string",
    main_symptoms: "string",
    prescribed_drugs: [{
      name: "string",
      dosage: "string",
      purpose: "string"
    }],
    detailed_analysis: "string",
    treatment_plan: "string",
    helpful_foods: ["string"],
    next_visit: "string",
    source: ["string"]
  },

  // 처방전 스키마
  [MEDICAL_DOCUMENT_CATEGORIES.prescription]: {
    patient_info: {
      name: "string",
      age: "number",
      patient_id: "string"
    },
    prescription_info: {
      prescription_date: "string",
      hospital_name: "string",
      doctor_name: "string",
      prescription_number: "string"
    },
    medications: [{
      name: "string",
      ingredient: "string",
      dosage: "string",
      frequency: "string",
      duration: "string",
      quantity: "string",
      purpose: "string",
      side_effects: "string",
      precautions: "string"
    }],
    total_medication_days: "number",
    special_instructions: "string",
    detailed_analysis: "string",
    drug_interactions: "string",
    helpful_foods: ["string"],
    source: ["string"]
  },

  // 약국 영수증/계산서 스키마
  [MEDICAL_DOCUMENT_CATEGORIES.pharmacy_receipt]: {
    patient_info: {
      name: "string"
    },
    receipt_info: {
      pharmacy_name: "string",
      pharmacist_name: "string",
      receipt_date: "string",
      receipt_number: "string"
    },
    medications: [{
      name: "string",
      quantity: "string",
      unit_price: "number",
      total_price: "number",
      insurance_covered: "boolean",
      patient_copay: "number"
    }],
    cost_summary: {
      total_amount: "number",
      insurance_amount: "number",
      patient_payment: "number",
      insurance_type: "string"
    },
    detailed_analysis: "string",
    cost_analysis: "string",
    source: ["string"]
  },

  // 검사결과 스키마
  [MEDICAL_DOCUMENT_CATEGORIES.lab_result]: {
    patient_info: {
      name: "string",
      age: "number",
      patient_id: "string"
    },
    test_info: {
      test_date: "string",
      hospital_name: "string",
      test_type: "string",
      doctor_name: "string"
    },
    test_results: [{
      test_name: "string",
      result_value: "string",
      normal_range: "string",
      unit: "string",
      status: "string" // normal, high, low, abnormal
    }],
    abnormal_results: [{
      test_name: "string",
      result_value: "string",
      normal_range: "string",
      severity: "string",
      clinical_significance: "string"
    }],
    detailed_analysis: "string",
    health_recommendations: "string",
    follow_up_needed: "boolean",
    helpful_foods: ["string"],
    lifestyle_changes: "string",
    source: ["string"]
  },

  // 건강검진 스키마
  [MEDICAL_DOCUMENT_CATEGORIES.health_checkup]: {
    patient_info: {
      name: "string",
      age: "number",
      gender: "string"
    },
    checkup_info: {
      checkup_date: "string",
      hospital_name: "string",
      checkup_type: "string"
    },
    vital_signs: {
      height: "string",
      weight: "string",
      bmi: "string",
      blood_pressure: "string",
      pulse: "string"
    },
    test_results: [{
      category: "string",
      test_name: "string",
      result: "string",
      status: "string"
    }],
    overall_assessment: "string",
    risk_factors: ["string"],
    recommendations: "string",
    detailed_analysis: "string",
    follow_up_schedule: "string",
    helpful_foods: ["string"],
    lifestyle_recommendations: "string",
    source: ["string"]
  },

  // 병원 영수증 스키마
  [MEDICAL_DOCUMENT_CATEGORIES.hospital_bill]: {
    patient_info: {
      name: "string",
      patient_id: "string"
    },
    bill_info: {
      hospital_name: "string",
      bill_date: "string",
      receipt_number: "string",
      visit_date: "string",
      department: "string"
    },
    cost_breakdown: [{
      service_name: "string",
      service_code: "string",
      quantity: "number",
      unit_price: "number",
      total_price: "number",
      insurance_covered: "boolean",
      coverage_rate: "number"
    }],
    cost_summary: {
      total_medical_cost: "number",
      insurance_amount: "number",
      patient_copay: "number",
      non_covered_amount: "number",
      final_payment: "number"
    },
    detailed_analysis: "string",
    cost_explanation: "string",
    insurance_info: "string",
    source: ["string"]
  }
};

// 문서 타입 분류를 위한 키워드
const CATEGORY_KEYWORDS = {
  [MEDICAL_DOCUMENT_CATEGORIES.medical_record]: [
    '진료기록', '차트', '의무기록', '진료차트', '외래기록', '입원기록'
  ],
  [MEDICAL_DOCUMENT_CATEGORIES.prescription]: [
    '처방전', '처방서', '의약품', '복용법', '용법', '용량'
  ],
  [MEDICAL_DOCUMENT_CATEGORIES.pharmacy_receipt]: [
    '약국', '조제', '영수증', '계산서', '약품비', '조제료'
  ],
  [MEDICAL_DOCUMENT_CATEGORIES.lab_result]: [
    '검사결과', '혈액검사', '소변검사', '임상검사', '진단검사'
  ],
  [MEDICAL_DOCUMENT_CATEGORIES.imaging_result]: [
    'CT', 'MRI', 'X-ray', '엑스레이', '초음파', '영상검사'
  ],
  [MEDICAL_DOCUMENT_CATEGORIES.health_checkup]: [
    '건강검진', '종합검진', '정기검진', '건강진단'
  ],
  [MEDICAL_DOCUMENT_CATEGORIES.hospital_bill]: [
    '진료비', '병원비', '의료비', '수납', '영수증', '명세서'
  ],
  [MEDICAL_DOCUMENT_CATEGORIES.diagnosis_report]: [
    '진단서', '진단명', '질병명'
  ],
  [MEDICAL_DOCUMENT_CATEGORIES.medical_certificate]: [
    '진료확인서', '치료확인서', '통원확인서'
  ]
};

module.exports = {
  MEDICAL_DOCUMENT_CATEGORIES,
  CATEGORY_NAMES_KR,
  CATEGORY_SCHEMAS,
  CATEGORY_KEYWORDS
}; 