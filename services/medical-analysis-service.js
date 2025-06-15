const OpenAI = require('openai');
const pdfParse = require('pdf-parse');
const { MEDICAL_DOCUMENT_CATEGORIES } = require('../utils/medical-document-categories');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

당신은 Notion 에디터와 동일한 순수 Markdown 문법만 사용하여 응답해야 합니다.
**굵은 글씨**, *기울임*, > 인용, - 목록, 1. 번호 목록, ## 소제목 등을 사용하세요.
오직 Markdown 텍스트만 응답하세요.
`;

/**
 * 의료 문서 분석
 */
async function analyzeMedicalRecord(fileBuffer, mimeType) {
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
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: DEFAULT_MEDICAL_PROMPT
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "첨부된 의료 문서를 분석하여 마크다운 형태로 응답해주세요."
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
            content: DEFAULT_MEDICAL_PROMPT
          },
          {
            role: "user",
            content: `다음 의료 문서를 분석하여 마크다운 형태로 응답해주세요:\n\n${content}`
          }
        ],
        stream: true,
        max_tokens: 3000,
        temperature: 0.1
      });
    }
  } catch (error) {
    console.error('의료 문서 분석 중 오류:', error);
    throw error;
  }
}

/**
 * 간단한 의료 문서 여부 확인
 */
async function checkIfMedicalRecord(fileBuffer, mimeType) {
  try {
    let content = '';
    
    // PDF 파일 처리
    if (mimeType === 'application/pdf') {
      const pdfData = await pdfParse(fileBuffer);
      content = pdfData.text;
    }

    // 의료 관련 키워드 검사
    const medicalKeywords = [
      '병원', '의원', '클리닉', '진료', '처방', '약국', '검사', '결과',
      '진단', '치료', '환자', '의사', '간호사', '약사', '처방전',
      '영수증', '진료비', '보험', '건강검진', '검진', 'mg', 'ml',
      '복용', '투약', '용법', '용량', '증상', '질환', '상병'
    ];
    
    const hasKeywords = medicalKeywords.some(keyword => 
      content.toLowerCase().includes(keyword)
    );
    
    return hasKeywords;
  } catch (error) {
    console.error('의료 문서 확인 중 오류:', error);
    return false;
  }
}

/**
 * 통합 분석 함수 (호환성을 위해 유지)
 */
async function analyzeUploadedMedicalDocument(fileBuffer, mimeType) {
  try {
    // 간단한 분류 결과 생성
    const classification = {
      category: 'other',
      confidence: 0.8
    };
    
    // 의료 문서 분석
    const analysisStream = await analyzeMedicalRecord(fileBuffer, mimeType);
    
    return {
      classification: classification,
      analysisStream: analysisStream
    };
    
  } catch (error) {
    console.error('의료 문서 분석 중 오류:', error);
    throw error;
  }
}

module.exports = {
  analyzeMedicalRecord,
  checkIfMedicalRecord,
  analyzeUploadedMedicalDocument
}; 