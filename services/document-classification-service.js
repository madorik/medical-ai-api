const OpenAI = require('openai');
const { 
  MEDICAL_DOCUMENT_CATEGORIES, 
  CATEGORY_NAMES_KR, 
  CATEGORY_KEYWORDS 
} = require('../utils/medical-document-categories');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * 의료 문서 카테고리 분류 시스템 프롬프트
 */
const CLASSIFICATION_SYSTEM_PROMPT = `
너는 의료 문서의 종류를 정확하게 분류하는 전문 AI다.
업로드된 의료 문서를 분석하여 다음 카테고리 중 하나로 분류해야 한다:

1. medical_record - 진료기록/차트
2. prescription - 처방전  
3. pharmacy_receipt - 약국 영수증/계산서
4. lab_result - 검사결과 (혈액, 소변 등)
5. imaging_result - 영상검사 (CT, MRI, X-ray 등)
6. health_checkup - 건강검진 결과
7. hospital_bill - 병원 진료비 영수증
8. diagnosis_report - 진단서
9. medical_certificate - 진료확인서
10. other - 기타 의료 관련 문서

분류 기준:
- 문서의 제목, 헤더, 주요 내용을 종합적으로 분석
- 포함된 의료 용어, 병원명, 의사명, 날짜 등을 고려
- 처방약, 검사 수치, 비용 정보 등 특징적 요소 파악

응답 형식: 반드시 위 카테고리 중 하나의 영문 코드만 출력 (예: "prescription")
`;

/**
 * 텍스트 기반 키워드 매칭으로 문서 타입 추론
 */
function classifyByKeywords(content) {
  const contentLower = content.toLowerCase();
  let maxScore = 0;
  let bestCategory = MEDICAL_DOCUMENT_CATEGORIES.other;
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    keywords.forEach(keyword => {
      if (contentLower.includes(keyword.toLowerCase())) {
        score += 1;
      }
    });
    
    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }
  
  return {
    category: bestCategory,
    confidence: maxScore > 0 ? 'medium' : 'low',
    matchedKeywords: maxScore
  };
}

/**
 * AI 기반 문서 카테고리 분류
 */
async function classifyMedicalDocumentByAI(content) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: CLASSIFICATION_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: `다음 의료 문서의 카테고리를 분류해주세요:\n\n${content.substring(0, 2000)}`
        }
      ],
      max_tokens: 50,
      temperature: 0.1
    });
    
    const category = response.choices[0].message.content.trim().toLowerCase();
    
    // 유효한 카테고리인지 확인
    if (Object.values(MEDICAL_DOCUMENT_CATEGORIES).includes(category)) {
      return {
        category,
        confidence: 'high',
        method: 'ai'
      };
    } else {
      return {
        category: MEDICAL_DOCUMENT_CATEGORIES.other,
        confidence: 'low',
        method: 'ai_fallback'
      };
    }
    
  } catch (error) {
    console.error('AI 기반 문서 분류 실패:', error);
    return {
      category: MEDICAL_DOCUMENT_CATEGORIES.other,
      confidence: 'low',
      method: 'error'
    };
  }
}

/**
 * 이미지 기반 문서 카테고리 분류
 */
async function classifyMedicalDocumentByImage(fileBuffer, mimeType) {
  try {
    const base64Image = fileBuffer.toString('base64');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: CLASSIFICATION_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "이 의료 문서 이미지의 카테고리를 분류해주세요."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 50,
      temperature: 0.1
    });
    
    const category = response.choices[0].message.content.trim().toLowerCase();
    
    if (Object.values(MEDICAL_DOCUMENT_CATEGORIES).includes(category)) {
      return {
        category,
        confidence: 'high',
        method: 'image_ai'
      };
    } else {
      return {
        category: MEDICAL_DOCUMENT_CATEGORIES.other,
        confidence: 'low',
        method: 'image_ai_fallback'
      };
    }
    
  } catch (error) {
    console.error('이미지 기반 문서 분류 실패:', error);
    return {
      category: MEDICAL_DOCUMENT_CATEGORIES.other,
      confidence: 'low',
      method: 'image_error'
    };
  }
}

/**
 * 통합 문서 카테고리 분류 함수
 */
async function classifyMedicalDocument(fileBuffer, mimeType, extractedContent = null) {
  try {
    let classificationResult;
    
    // 이미지 파일인 경우
    if (mimeType.startsWith('image/')) {
      classificationResult = await classifyMedicalDocumentByImage(fileBuffer, mimeType);
    }
    // PDF 등 텍스트 추출 가능한 파일인 경우
    else if (extractedContent) {
      // 먼저 키워드 매칭 시도
      const keywordResult = classifyByKeywords(extractedContent);
      
      // 키워드 매칭 결과가 확실하면 사용, 아니면 AI로 재분류
      if (keywordResult.confidence === 'medium' && keywordResult.matchedKeywords >= 2) {
        classificationResult = keywordResult;
      } else {
        const aiResult = await classifyMedicalDocumentByAI(extractedContent);
        classificationResult = aiResult;
      }
    }
    // 내용 추출이 안된 경우 기본값
    else {
      classificationResult = {
        category: MEDICAL_DOCUMENT_CATEGORIES.other,
        confidence: 'low',
        method: 'no_content'
      };
    }
    
    return {
      ...classificationResult,
      categoryName: CATEGORY_NAMES_KR[classificationResult.category] || '기타',
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('문서 분류 중 오류:', error);
    return {
      category: MEDICAL_DOCUMENT_CATEGORIES.other,
      categoryName: '기타',
      confidence: 'low',
      method: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * 모든 지원되는 카테고리 목록 반환
 */
function getSupportedCategories() {
  return Object.entries(CATEGORY_NAMES_KR).map(([code, name]) => ({
    code,
    name,
    description: getCategoryDescription(code)
  }));
}

/**
 * 카테고리별 설명 반환
 */
function getCategoryDescription(category) {
  const descriptions = {
    [MEDICAL_DOCUMENT_CATEGORIES.medical_record]: '의사의 진료 기록이나 외래/입원 차트',
    [MEDICAL_DOCUMENT_CATEGORIES.prescription]: '의사가 발행한 처방전',
    [MEDICAL_DOCUMENT_CATEGORIES.pharmacy_receipt]: '약국에서 발행한 영수증이나 약제비 계산서',
    [MEDICAL_DOCUMENT_CATEGORIES.lab_result]: '혈액검사, 소변검사 등 임상검사 결과',
    [MEDICAL_DOCUMENT_CATEGORIES.imaging_result]: 'CT, MRI, X-ray 등 영상검사 결과',
    [MEDICAL_DOCUMENT_CATEGORIES.health_checkup]: '종합건강검진이나 정기검진 결과',
    [MEDICAL_DOCUMENT_CATEGORIES.hospital_bill]: '병원에서 발행한 진료비 영수증이나 명세서',
    [MEDICAL_DOCUMENT_CATEGORIES.diagnosis_report]: '질병 진단을 위한 공식 진단서',
    [MEDICAL_DOCUMENT_CATEGORIES.medical_certificate]: '치료나 통원을 확인하는 증명서',
    [MEDICAL_DOCUMENT_CATEGORIES.other]: '기타 의료 관련 문서'
  };
  
  return descriptions[category] || '해당 카테고리에 대한 설명이 없습니다.';
}

module.exports = {
  classifyMedicalDocument,
  classifyByKeywords,
  classifyMedicalDocumentByAI,
  classifyMedicalDocumentByImage,
  getSupportedCategories,
  getCategoryDescription
}; 