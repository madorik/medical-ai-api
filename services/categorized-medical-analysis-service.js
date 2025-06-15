const OpenAI = require('openai');
const pdfParse = require('pdf-parse');
const { 
  MEDICAL_DOCUMENT_CATEGORIES, 
  CATEGORY_SCHEMAS 
} = require('../utils/medical-document-categories');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * 카테고리별 시스템 프롬프트 정의
 */
const CATEGORY_PROMPTS = {
  // 진료기록 분석 프롬프트
  [MEDICAL_DOCUMENT_CATEGORIES.medical_record]: `
    너는 진료기록을 전문적으로 분석하는 의료 AI다.
    진료기록을 분석하여 환자의 상태, 진단, 치료계획을 명확히 파악하고 구조화된 JSON을 생성한다.
    특히 다음에 집중해야 한다:
    - 정확한 진단명과 상병코드
    - 주요 증상과 경과
    - 처방약물의 목적과 효과
    - 향후 치료 방향과 추적 검사 계획
    - 환자가 주의해야 할 사항들
  `,

  // 처방전 분석 프롬프트  
  [MEDICAL_DOCUMENT_CATEGORIES.prescription]: `
    너는 처방전을 전문적으로 분석하는 약학 AI다.
    처방전의 약물 정보를 상세히 분석하여 다음을 제공한다:
    - 각 약물의 성분과 효능
    - 정확한 복용법과 주의사항
    - 약물 간 상호작용 위험성
    - 부작용과 관리법
    - 복약 기간과 준수사항
    - 도움이 되는 음식과 피해야 할 음식
  `,

  // 약국 영수증 분석 프롬프트
  [MEDICAL_DOCUMENT_CATEGORIES.pharmacy_receipt]: `
    너는 약국 영수증과 의료비를 전문적으로 분석하는 AI다.
    다음을 중점적으로 분석한다:
    - 조제된 약물의 종류와 비용
    - 보험 적용 여부와 본인부담금
    - 급여/비급여 구분과 그 이유
    - 약물별 단가와 총 비용 구조
    - 보험 혜택 최적화 방법
  `,

  // 검사결과 분석 프롬프트
  [MEDICAL_DOCUMENT_CATEGORIES.lab_result]: `
    너는 임상검사 결과를 전문적으로 해석하는 의료 AI다.
    검사 수치를 정확히 분석하여 다음을 제공한다:
    - 각 검사 항목의 의미와 정상 범위
    - 비정상 수치의 임상적 의미
    - 건강 위험도와 심각성 평가
    - 수치 개선을 위한 구체적 방법
    - 추가 검사 필요성과 추적 주기
    - 생활습관 개선 권장사항
  `,

  // 건강검진 분석 프롬프트
  [MEDICAL_DOCUMENT_CATEGORIES.health_checkup]: `
    너는 건강검진 결과를 종합적으로 분석하는 예방의학 AI다.
    전체적인 건강 상태를 평가하여 다음을 제공한다:
    - 종합적인 건강 상태 평가
    - 질병 위험요인과 예방법
    - 연령대별 주의사항
    - 맞춤형 건강관리 계획
    - 정기 검진 스케줄 추천
    - 라이프스타일 개선 방향
  `,

  // 병원 영수증 분석 프롬프트
  [MEDICAL_DOCUMENT_CATEGORIES.hospital_bill]: `
    너는 의료비와 보험 청구를 전문적으로 분석하는 AI다.
    다음을 중점적으로 분석한다:
    - 진료비 구성과 세부 항목
    - 보험 적용률과 본인부담률
    - 급여/비급여 구분 이유
    - 의료비 절약 방법
    - 보험 청구 최적화 방안
    - 추가 혜택 가능성
  `
};


/**
 * 카테고리별 요약 생성
 */
async function generateCategorySummary(analysisResult, category) {
  try {
    const summaryPrompts = {
      [MEDICAL_DOCUMENT_CATEGORIES.prescription]: "처방된 주요 약물과 복용 목적을 1-2문장으로 요약",
      [MEDICAL_DOCUMENT_CATEGORIES.pharmacy_receipt]: "조제한 약물과 총 비용을 1-2문장으로 요약", 
      [MEDICAL_DOCUMENT_CATEGORIES.lab_result]: "주요 검사 결과와 건강 상태를 1-2문장으로 요약",
      [MEDICAL_DOCUMENT_CATEGORIES.health_checkup]: "전체 건강 상태와 주요 소견을 1-2문장으로 요약",
      [MEDICAL_DOCUMENT_CATEGORIES.hospital_bill]: "진료 내용과 총 의료비를 1-2문장으로 요약"
    };
    
    const promptText = summaryPrompts[category] || "진단명과 주요 권장사항을 1-2문장으로 요약";
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: `
          다음 의료 분석을 ${promptText}해주세요:
          ${analysisResult}
          예시: "혈압 전단계, 공복혈당 장애 확인. 운동과 식이조절 필요"`
        }
      ],
      stream: false,
      max_tokens: 80,
      temperature: 0.2
    });
    
    let summaryText = response.choices[0].message.content.trim();
    
    // 요약이 너무 길면 자르기
    if (summaryText.length > 100) {
      summaryText = summaryText.substring(0, 97) + '...';
    }
    
    return summaryText;
    
  } catch (error) {
    console.error('카테고리별 요약 생성 실패:', error);
    
    // 카테고리별 기본 fallback 메시지
    const fallbackMessages = {
      [MEDICAL_DOCUMENT_CATEGORIES.prescription]: "처방전 분석 완료",
      [MEDICAL_DOCUMENT_CATEGORIES.pharmacy_receipt]: "약국 영수증 분석 완료",
      [MEDICAL_DOCUMENT_CATEGORIES.lab_result]: "검사 결과 분석 완료", 
      [MEDICAL_DOCUMENT_CATEGORIES.health_checkup]: "건강검진 분석 완료",
      [MEDICAL_DOCUMENT_CATEGORIES.hospital_bill]: "진료비 영수증 분석 완료"
    };
    
    return fallbackMessages[category] || "의료 문서 분석 완료";
  }
}

/**
 * 카테고리 정보 반환
 */
function getCategoryInfo(category) {
  const categoryInfos = {
    [MEDICAL_DOCUMENT_CATEGORIES.medical_record]: {
      name: "진료기록",
      icon: "📋",
      color: "#4CAF50",
      description: "의사의 진료 기록과 치료 계획"
    },
    [MEDICAL_DOCUMENT_CATEGORIES.prescription]: {
      name: "처방전", 
      icon: "💊",
      color: "#2196F3",
      description: "처방된 약물과 복용법"
    },
    [MEDICAL_DOCUMENT_CATEGORIES.pharmacy_receipt]: {
      name: "약국 영수증",
      icon: "🧾", 
      color: "#FF9800",
      description: "약국에서 조제한 약물과 비용"
    },
    [MEDICAL_DOCUMENT_CATEGORIES.lab_result]: {
      name: "검사결과",
      icon: "🔬",
      color: "#9C27B0", 
      description: "혈액검사 등 임상검사 결과"
    },
    [MEDICAL_DOCUMENT_CATEGORIES.health_checkup]: {
      name: "건강검진",
      icon: "🏥",
      color: "#00BCD4",
      description: "종합건강검진 결과"
    },
    [MEDICAL_DOCUMENT_CATEGORIES.hospital_bill]: {
      name: "병원 영수증",
      icon: "💳",
      color: "#795548", 
      description: "병원 진료비와 보험 적용 내역"
    }
  };
  
  return categoryInfos[category] || {
    name: "기타",
    icon: "📄", 
    color: "#9E9E9E",
    description: "기타 의료 관련 문서"
  };
}

module.exports = {
  analyzeMedicalDocumentByCategory,
  generateCategorySummary,
  getCategoryInfo,
  CATEGORY_PROMPTS
}; 