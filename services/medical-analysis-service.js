const OpenAI = require('openai');
const pdfParse = require('pdf-parse');
const { MEDICAL_DOCUMENT_CATEGORIES, CATEGORY_NAMES_KR } = require('../utils/medical-document-categories');

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

* **핵심 단어는 굵게**, *필요 시 기울임*을 사용해 가독성을 높여라

코드나 명령어가 있으면 백틱(\`)으로 감싸고, 여러 줄일 경우 코드 블럭을 사용한다.
응답은 반드시 Markdown 텍스트로만 구성하고, HTML, 이모지, 아이콘, 여백 스타일 등은 절대 포함하지 마라.
`;

// 의료기록 상세 분석을 위한 통합 프롬프트
const DETAILED_MEDICAL_ANALYSIS_PROMPT = `
너는 의료기록 및 진료기록을 전문적으로 분석하는 의료 AI다. 정확성을 가장 중요하게 생각하고 분석하라. 특히 환자정보는 가장 정확해야 한다.
업로드된 이미지에서 의료 관련 정보를 찾아 굉장히 상세하게 분석하고 구조화된 정보를 제공한다.
분석한 결과를 환자가 가장 먼저 알아야 할 정보를 최대한 자세하게 제공하고, 중요 포인트를 가장 상단에 노출하라.

다음과 같은 의료 문서들을 분석할 수 있다:
- 진료기록 및 진료소견서
- 처방전 및 처방내역
- 약국 영수증 및 조제내역  
- 검사결과 (혈액검사, 소변검사, 영상검사 등)
- 건강검진 결과
- 병원 영수증 및 진료비 내역
- 기타 의료 관련 문서

**상세 분석 지침:**

1. **문서 유형 식별**: 먼저 어떤 종류의 의료 문서인지 정확히 파악한다
2. **핵심 정보 추출**: 환자 정보, 진단명, 의료진 정보, 날짜 등을 명확히 추출한다
3. **의학적 내용 해석**: 전문 용어를 일반인이 이해할 수 있도록 상세히 설명한다
4. **임상적 의미 분석**: 각 수치, 진단, 처방의 의학적 의미를 깊이 있게 해석한다
5. **환자 맞춤 조언**: 환자가 알아야 할 중요한 사항들을 구체적으로 제시한다

**분석 형식 (문서 유형에 따라 유연하게 적용):**

# 문서 정보
- **문서 유형**: 진료기록/처방전/검사결과 등
- **발행 기관**: 병원명 또는 의료기관  
- **발행일**: 문서 작성일
- **담당 의료진**: 의사명 또는 담당자

# 환자 정보
- **환자명**: 
- **나이/성별**: 확인 가능한 경우
- **접수번호**: 차트번호나 접수번호

# 중요 포인트
> 환자가 반드시 알아야 할 핵심 사항들

# 주요 내용 분석
## 진단 및 상태 (해당 없으면 제외)
- **주 진단**
  - 주요 진단명과 상병코드
- **부 진단**
  - 추가 진단사항  
- **현재 상태**
  - 환자의 현재 건강 상태
- **증상**
  - 주요 증상과 경과
  
## 치료 내용 (해당 없으면 제외)
- **처방 약물**
  - 약물명과 성분
  - 용법 용량 (복용 방법)
  - 치료 목적과 효과
  - 예상 부작용
- **치료 계획**
  - 향후 치료 방향
- **추적 검사**
  - 필요한 추가 검사
  
## 검사 결과 (해당 없으면 제외)
- **정상 수치**
  - 정상 범위 내 항목들
- **이상 수치**
  - 비정상 수치와 정상 범위
  - 의학적 의미와 위험도  
  - 개선 방법
- **종합 해석**
  - 전체적인 건강 상태 평가
   
## 비용 정보 (해당없으면 제외)
- **총 진료비**: 전체 비용
- **보험 적용**: 급여/비급여 구분
- **본인부담금**: 실제 지불 금액
- **세부 내역**
  - 항목별 비용 분석
  
# 권장사항
- **복약 지침**
  - 정확한 복용법
- **생활 관리**
  - 일상 생활에서 주의사항
- **추후 진료**
  - 다음 진료 일정이나 응급상황 대응
- **예방법**
  - 재발 방지나 건강 유지 방법
  
# 추가 설명
## 의학 용어
- 어려운 의학 용어 상세 설명

## 참고사항
- 환자가 알면 도움될 추가 정보

${NOTION_MARKDOWN_STYLE}

**주의사항:**
- 의료진의 진단이나 처방을 임의로 변경하지 말 것
- 응급상황이 의심되면 즉시 의료진 상담을 권할 것  
- 개인정보는 최대한 보호하되 의학적 정보는 상세히 제공할 것
- 불확실한 내용은 추측하지 말고 확인 가능한 정보만 제공할 것
`;

// 문서 유형 분류를 위한 프롬프트
const DOCUMENT_CLASSIFICATION_PROMPT = `
너는 의료 문서의 유형을 정확히 분류하는 전문가다. 
업로드된 이미지나 텍스트에서 의료 문서의 종류를 파악하여 다음 카테고리 중 하나로 분류해야 한다:

분류 카테고리:
- medical_record: 진료기록/차트
- diagnosis_report: 진단서  
- medical_opinion: 소견서
- referral_letter: 의뢰서/회송서
- prescription: 처방전
- medication_guide: 복약지도서
- pharmacy_receipt: 약국 영수증/계산서
- lab_result: 혈액/소변 등 검사결과
- imaging_result: 영상검사 (CT, MRI, X-ray 등)
- health_checkup: 건강검진 결과
- pathology_report: 병리검사 보고서
- hospital_bill: 병원 진료비 영수증
- insurance_claim: 보험청구서
- medical_certificate: 진료확인서
- vaccination_record: 예방접종 증명서
- disability_assessment: 장애진단서
- fitness_certificate: 건강진단서
- discharge_summary: 퇴원요약서
- other: 기타 의료 관련 문서

반드시 위 카테고리 중 하나만을 정확히 응답하라. 추가 설명 없이 카테고리명만 출력하라.
`;

/**
 * 업로드된 의료 문서를 상세 분석
 */
async function analyzeMedicalDocument(fileBuffer, mimeType, model = '4o-mini') {
  try {
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
        model: model.startsWith('gpt-') ? model : `gpt-${model}`,
        messages: [
          {
            role: "system",
            content: DETAILED_MEDICAL_ANALYSIS_PROMPT
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "첨부된 의료 문서를 상세히 분석하여 마크다운 형태로 응답해주세요. 의료기록이나 진료기록과 관련된 정보가 있다면 매우 자세하게 분석해주세요."
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
        max_tokens: 4000,
        temperature: 0.1
      });
    } else {
      // 텍스트 기반 분석
      return openai.chat.completions.create({
        model: model.startsWith('gpt-') ? model : `gpt-${model}`,
        messages: [
          {
            role: "system",
            content: DETAILED_MEDICAL_ANALYSIS_PROMPT
          },
          {
            role: "user",
            content: `다음 의료 문서를 상세히 분석하여 마크다운 형태로 응답해주세요. 의료기록이나 진료기록과 관련된 정보가 있다면 매우 자세하게 분석해주세요:\n\n${content}`
          }
        ],
        stream: true,
        max_tokens: 4000,
        temperature: 0.1
      });
    }
  } catch (error) {
    console.error('의료 문서 분석 중 오류:', error);
    throw error;
  }
}

/**
 * 분석 결과에서 요약 생성
 */
async function generateAnalysisSummary(fullAnalysisContent, model = '4o-mini') {
  try {
    const response = await openai.chat.completions.create({
      model: model.startsWith('gpt-') ? model : `gpt-${model}`,
      messages: [
        {
          role: "system",
          content: `당신은 의료 분석 결과를 간결하게 요약하는 전문가입니다.
          주어진 의료 분석 내용을 핵심만 추출하여 3-4문장으로 요약해주세요.
          - 주요 진단이나 발견사항
          - 중요한 수치나 결과
          - 환자가 주의해야 할 핵심 사항
          - 권장사항 중 가장 중요한 것.`
        },
        {
          role: "user",
          content: `다음 의료 분석 내용을 요약해주세요:\n\n${fullAnalysisContent}`
        }
      ],
      max_tokens: 500,
      temperature: 0.1
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('요약 생성 중 오류:', error);
    return '분석 완료: 자세한 내용은 전체 분석 결과를 확인해주세요.';
  }
}

/**
 * 의료 문서 분석 (요약 및 문서 유형 분류 포함)
 */
async function analyzeUploadedMedicalDocumentWithSummary(fileBuffer, mimeType, model = '4o-mini') {
  try {
    // 문서 유형 먼저 분류
    const documentType = await classifyMedicalDocumentType(fileBuffer, mimeType, model);
    
    // 직접 상세 분석 수행
    const analysisStream = await analyzeMedicalDocument(fileBuffer, mimeType, model);

    // 전체 분석 내용을 수집하기 위한 변수
    let fullAnalysisContent = '';
    
    return {
      documentType: documentType, // 문서 유형 추가
      documentTypeName: CATEGORY_NAMES_KR[documentType] || '기타', // 한국어 이름 추가
      analysisStream: analysisStream,
      // 분석 내용을 누적하는 함수
      accumulateContent: (content) => {
        fullAnalysisContent += content;
      },
      // 최종 요약 생성 함수
      generateSummary: async () => {
        if (fullAnalysisContent.trim()) {
          return await generateAnalysisSummary(fullAnalysisContent, model);
        }
        return '분석 완료';
      }
    };
  } catch (error) {
    console.error('의료 문서 분석 중 오류:', error);
    throw error;
  }
}

/**
 * 의료 문서 분석 (기존 호환성 유지)
 */
async function analyzeUploadedMedicalDocument(fileBuffer, mimeType, model = '4o-mini') {
  try {
    // 직접 상세 분석 수행
    const analysisStream = await analyzeMedicalDocument(fileBuffer, mimeType, model);
    
    return {
      analysisStream: analysisStream
    };
    
  } catch (error) {
    console.error('의료 문서 분석 중 오류:', error);
    throw error;
  }
}

/**
 * 의료 문서 유형 자동 분류
 */
async function classifyMedicalDocumentType(fileBuffer, mimeType, model = '4o-mini') {
  try {
    let content = '';
    
    // PDF 파일 처리
    if (mimeType === 'application/pdf') {
      const pdfData = await pdfParse(fileBuffer);
      content = pdfData.text.slice(0, 2000); // 처음 2000자만 사용
    }

    // 이미지 파일인 경우 Vision API 사용
    if (mimeType.startsWith('image/')) {
      const base64Image = fileBuffer.toString('base64');
      const response = await openai.chat.completions.create({
        model: model.startsWith('gpt-') ? model : `gpt-${model}`,
        messages: [
          {
            role: "system",
            content: DOCUMENT_CLASSIFICATION_PROMPT
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "이 의료 문서의 유형을 분류해주세요."
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

      const documentType = response.choices[0].message.content.trim();
      
      // 유효한 카테고리인지 확인
      if (Object.values(MEDICAL_DOCUMENT_CATEGORIES).includes(documentType)) {
        return documentType;
      }
      
      return MEDICAL_DOCUMENT_CATEGORIES.other;
    } else {
      // 텍스트 기반 분류
      const response = await openai.chat.completions.create({
        model: model.startsWith('gpt-') ? model : `gpt-${model}`,
        messages: [
          {
            role: "system",
            content: DOCUMENT_CLASSIFICATION_PROMPT
          },
          {
            role: "user",
            content: `다음 의료 문서의 유형을 분류해주세요:\n\n${content}`
          }
        ],
        max_tokens: 50,
        temperature: 0.1
      });

      const documentType = response.choices[0].message.content.trim();
      
      // 유효한 카테고리인지 확인
      if (Object.values(MEDICAL_DOCUMENT_CATEGORIES).includes(documentType)) {
        return documentType;
      }
      
      return MEDICAL_DOCUMENT_CATEGORIES.other;
    }
  } catch (error) {
    console.error('문서 유형 분류 중 오류:', error);
    return MEDICAL_DOCUMENT_CATEGORIES.other; // 오류 시 기타로 분류
  }
}

module.exports = {
  analyzeUploadedMedicalDocument,
  analyzeUploadedMedicalDocumentWithSummary,
  generateAnalysisSummary,
  analyzeMedicalDocument,
  classifyMedicalDocumentType
}; 