const OpenAI = require('openai');
const pdfParse = require('pdf-parse');
const { MEDICAL_DOCUMENT_CATEGORIES } = require('../utils/medical-document-categories');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Notion 최적화 Markdown 스타일 가이드라인
const NOTION_MARKDOWN_STYLE = `
너는 Notion 에디터에 최적화된 순수 Markdown 형식으로만 응답해야 한다.  
다음과 같은 스타일로 구성하라:

# 중요 주제  
## 소제목  
> 인용문이 필요한 경우는 인용 블럭으로  
1. 번호가 필요한 항목은 번호 목록으로  

- 번호가 없는 목록은 하이픈으로 구분하되, 들여쓰기를 사용해 위계 표시
   - 하위 항목은 하이픈으로 들여쓰기    
**핵심 단어는 굵게**, *필요 시 기울임*을 사용해 가독성을 높여라.  

코드나 명령어가 있으면 백틱(\`)으로 감싸고, 여러 줄일 경우 코드 블럭을 사용한다.
응답은 반드시 Markdown 텍스트로만 구성하고, HTML, 이모지, 아이콘, 여백 스타일 등은 절대 포함하지 마라.
`;

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

/**
 * 카테고리별 시스템 프롬프트 정의
 */
const CATEGORY_PROMPTS = {
  // 진료기록 분석 프롬프트
  [MEDICAL_DOCUMENT_CATEGORIES.medical_record]: `
너는 진료기록을 전문적으로 분석하는 의료 AI다.
진료기록을 분석하여 환자의 상태, 진단, 치료계획을 명확히 파악하고 구조화된 정보를 제공한다.

특히 다음에 집중해야 한다:
- 정확한 진단명과 상병코드
- 주요 증상과 경과
- 처방약물의 목적과 효과
- 향후 치료 방향과 추적 검사 계획
- 환자가 주의해야 할 사항들

**분석 형식:**
- **환자 정보**: 이름, 나이, 성별 등
- **진단 정보**: 주 진단, 부 진단, 상병코드
- **증상 및 경과**: 주요 증상과 치료 경과
- **처방 약물**: 약물명, 용법, 효능
- **치료 계획**: 향후 치료 방향
- **주의사항**: 환자가 지켜야 할 사항들

${NOTION_MARKDOWN_STYLE}
  `,

  // 처방전 분석 프롬프트  
  [MEDICAL_DOCUMENT_CATEGORIES.prescription]: `
너는 처방전을 전문적으로 분석하는 약학 AI다.
처방전의 약물 정보를 상세히 분석하여 환자가 이해하기 쉽게 설명한다.

특히 다음을 제공한다:
- 각 약물의 성분과 효능
- 정확한 복용법과 주의사항
- 약물 간 상호작용 위험성
- 부작용과 관리법
- 복약 기간과 준수사항
- 도움이 되는 음식과 피해야 할 음식

**분석 형식:**
- **처방 정보**: 처방일, 병원명, 의사명
- **처방 약물**: 약물별 상세 정보
- **복용법**: 용법, 용량, 복용 시간
- **주의사항**: 부작용, 금기사항
- **상호작용**: 약물/음식 상호작용
- **생활 관리**: 복약 중 생활 수칙

${NOTION_MARKDOWN_STYLE}
  `,

  // 약국 영수증 분석 프롬프트
  [MEDICAL_DOCUMENT_CATEGORIES.pharmacy_receipt]: `
너는 약국 영수증과 의료비를 전문적으로 분석하는 AI다.
조제비와 약물비를 상세히 분석하여 환자가 이해하기 쉽게 설명한다.

다음을 중점적으로 분석한다:
- 조제된 약물의 종류와 비용
- 보험 적용 여부와 본인부담금
- 급여/비급여 구분과 그 이유
- 약물별 단가와 총 비용 구조
- 보험 혜택 최적화 방법

**분석 형식:**
- **영수증 정보**: 약국명, 조제일, 영수증 번호
- **조제 약물**: 약물별 비용 내역
- **비용 분석**: 총액, 보험 적용액, 본인부담금
- **보험 적용**: 급여/비급여 구분
- **절약 방법**: 의료비 절약 팁

${NOTION_MARKDOWN_STYLE}
  `,

  // 검사결과 분석 프롬프트
  [MEDICAL_DOCUMENT_CATEGORIES.lab_result]: `
너는 임상검사 결과를 전문적으로 해석하는 의료 AI다.
검사 수치를 정확히 분석하여 환자가 이해하기 쉽게 설명한다.

검사 수치를 정확히 분석하여 다음을 제공한다:
- 각 검사 항목의 의미와 정상 범위
- 비정상 수치의 임상적 의미
- 건강 위험도와 심각성 평가
- 수치 개선을 위한 구체적 방법
- 추가 검사 필요성과 추적 주기
- 생활습관 개선 권장사항

**분석 형식:**
- **검사 개요**: 검사일, 검사 종류, 검사 기관
- **정상 수치**: 정상 범위 내 검사 항목들
- **이상 수치**: 비정상 수치와 그 의미
- **위험도 평가**: 건강 위험 정도
- **개선 방법**: 수치 개선을 위한 방법
- **추적 검사**: 필요한 추가 검사와 주기

${NOTION_MARKDOWN_STYLE}
  `,

  // 건강검진 분석 프롬프트
  [MEDICAL_DOCUMENT_CATEGORIES.health_checkup]: `
너는 건강검진 결과를 종합적으로 분석하는 예방의학 AI다.
전체적인 건강 상태를 평가하여 맞춤형 건강관리 계획을 제공한다.

전체적인 건강 상태를 평가하여 다음을 제공한다:
- 종합적인 건강 상태 평가
- 질병 위험요인과 예방법
- 연령대별 주의사항
- 맞춤형 건강관리 계획
- 정기 검진 스케줄 추천
- 라이프스타일 개선 방향

**분석 형식:**
- **검진 개요**: 검진일, 검진 종류, 검진 기관
- **종합 평가**: 전체적인 건강 상태
- **위험 요인**: 질병 위험 요인들
- **예방 방법**: 질병 예방을 위한 방법
- **건강 관리**: 맞춤형 건강관리 계획
- **정기 검진**: 추천 검진 스케줄

${NOTION_MARKDOWN_STYLE}
  `,

  // 병원 영수증 분석 프롬프트
  [MEDICAL_DOCUMENT_CATEGORIES.hospital_bill]: `
너는 의료비와 보험 청구를 전문적으로 분석하는 AI다.
진료비를 상세히 분석하여 환자가 이해하기 쉽게 설명한다.

다음을 중점적으로 분석한다:
- 진료비 구성과 세부 항목
- 보험 적용률과 본인부담률
- 급여/비급여 구분 이유
- 의료비 절약 방법
- 보험 청구 최적화 방안
- 추가 혜택 가능성

**분석 형식:**
- **진료 정보**: 진료일, 병원명, 진료과
- **비용 구성**: 진료비 세부 항목
- **보험 적용**: 급여/비급여 구분
- **본인부담**: 실제 지불 금액
- **절약 방법**: 의료비 절약 팁
- **추가 혜택**: 가능한 추가 혜택

${NOTION_MARKDOWN_STYLE}
  `
};

// 기본 의료 문서 분석 프롬프트
const DEFAULT_MEDICAL_PROMPT = `
너는 의료 문서를 전문적으로 분석하는 의료 AI다.
업로드된 의료 문서를 분석하여 환자가 이해하기 쉽게 설명한다.

다음을 중점적으로 분석한다:
- 문서의 종류와 목적
- 주요 내용과 핵심 정보
- 진단명이나 처방약물 정보
- 환자에게 중요한 사항들
- 추가로 필요한 조치나 절차
- 관련 의료진 상담 권고사항

**분석 형식:**
- **문서 정보**: 문서 종류, 발급 기관, 발급일
- **주요 내용**: 핵심 정보 요약
- **중요 사항**: 환자가 알아야 할 중요한 내용
- **필요 조치**: 추가로 필요한 절차나 행동
- **상담 권고**: 의료진 상담이 필요한 사항

${NOTION_MARKDOWN_STYLE}
`;

/**
 * 이미지에서 의료 문서 카테고리 분류
 */
async function classifyMedicalDocumentFromImage(fileBuffer, mimeType) {
  try {
    if (!mimeType.startsWith('image/')) {
      throw new Error('이미지 파일만 분류할 수 있습니다.');
    }

    const base64Image = fileBuffer.toString('base64');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system", 
          content: `당신은 의료 문서 이미지를 분류하는 전문 AI입니다.

다음 카테고리 중 하나로 분류해주세요:
- medical_record: 진료기록 (진료차트, 진료노트, 의무기록)
- prescription: 처방전 (의사가 발행한 처방전)
- pharmacy_receipt: 약국 영수증 (약국에서 발행한 영수증)
- lab_result: 검사결과 (혈액검사, 소변검사, 각종 임상검사 결과)
- health_checkup: 건강검진 (종합건강검진, 국가건강검진 결과)
- hospital_bill: 병원 영수증 (병원 진료비 영수증, 수납증)
- other: 기타 (위에 해당하지 않는 의료 관련 문서)

응답은 반드시 다음 JSON 형식으로만 답변하세요:
{
  "category": "카테고리명",
  "confidence": 신뢰도(0.0~1.0),
  "reason": "분류 이유"
}`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "이 의료 문서 이미지를 분류해주세요."
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
      max_tokens: 500,
      temperature: 0.1
    });

    const result = response.choices[0].message.content;
    
    try {
      const parsed = JSON.parse(result);
      return {
        category: parsed.category || 'other',
        confidence: parsed.confidence || 0.5,
        reason: parsed.reason || '분류 완료'
      };
    } catch (parseError) {
      console.error('JSON 파싱 오류:', parseError);
      return {
        category: 'other',
        confidence: 0.5,
        reason: '분류 중 오류 발생'
      };
    }

  } catch (error) {
    console.error('이미지 분류 중 오류:', error);
    return {
      category: 'other',
      confidence: 0.3,
      reason: '분류 실패'
    };
  }
}

/**
 * 카테고리별 맞춤형 의료 문서 분석
 */
async function analyzeMedicalRecordByCategory(fileBuffer, mimeType, category) {
  try {
    // 카테고리별 시스템 프롬프트 선택
    const systemPrompt = CATEGORY_PROMPTS[category] || DEFAULT_MEDICAL_PROMPT;
    
    let content = '';
    
    // PDF 파일 처리
    if (mimeType === 'application/pdf') {
      const pdfData = await pdfParse(fileBuffer);
      content = pdfData.text;
    }

    // 이미지 파일인 경우 Vision API 사용
    if (mimeType.startsWith('image/')) {
      const base64Image = fileBuffer.toString('base64');
      return openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "첨부된 의료 문서를 카테고리에 맞게 분석하여 마크다운 형태로 응답해주세요."
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
        stream: true,
        max_tokens: 3000,
        temperature: 0.1
      });
    } else {
      // 텍스트 기반 분석
      return openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `다음 의료 문서를 카테고리에 맞게 분석하여 마크다운 형태로 응답해주세요:\n\n${content}`
          }
        ],
        stream: true,
        max_tokens: 3000,
        temperature: 0.1
      });
    }
  } catch (error) {
    console.error('카테고리별 의료 문서 분석 중 오류:', error);
    throw error;
  }
}

/**
 * 통합 분석 함수 - 카테고리 분류 후 분석
 */
async function analyzeUploadedMedicalDocument(fileBuffer, mimeType) {
  try {
    let classificationResult;

    // 이미지 파일인 경우 Vision API로 분류
    if (mimeType.startsWith('image/')) {
      classificationResult = await classifyMedicalDocumentFromImage(fileBuffer, mimeType);
    } else {
      // PDF 등 기타 파일의 경우 기본 분류
      classificationResult = {
        category: 'other',
        confidence: 0.8,
        reason: 'PDF 파일 기본 분류'
      };
    }
    
    // 카테고리별 맞춤 분석
    const analysisStream = await analyzeMedicalRecordByCategory(
      fileBuffer, 
      mimeType, 
      classificationResult.category
    );
    
    return {
      classification: classificationResult,
      analysisStream: analysisStream,
      categoryInfo: getCategoryInfo(classificationResult.category)
    };
    
  } catch (error) {
    console.error('의료 문서 분석 중 오류:', error);
    throw error;
  }
}

module.exports = {
  analyzeUploadedMedicalDocument,
  getCategoryInfo,
  classifyMedicalDocumentFromImage,
  analyzeMedicalRecordByCategory
}; 