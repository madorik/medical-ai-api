const OpenAI = require('openai');
const pdfParse = require('pdf-parse');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// 의료 문서 진료 리포트 생성 시스템 프롬프트
const MEDICAL_DOCUMENT_SYSTEM_PROMPT = `
너는 의료 문서(진료기록, 처방전, 검사 결과지 등)를 분석해 구조화된 JSON을 생성하는 의료 데이터 전문 AI다.  
반드시 아래 스키마를 그대로 따르는 **파싱 가능한 JSON** 하나만 출력한다.  
데이터가 없을 경우 빈 문자열("") 또는 빈 배열([])로 채운다.  
날짜는 YYYY-MM-DD 형식을 사용하고, 숫자·단위는 원본 값을 유지한다.  
detailed_analysis는 1000자 이하의 자연어 문장으로 작성한다.
출처에는 AI 분석 결과에 신빙성을 줄 수 있는 연구, 논문 등의 출처 링크를 포함한다.
patient_info는 진료 기록에 있는 환자 정보를 추출한다. 없으면 빈값으로 채운다.
### JSON 스키마
{
  "patient_info": {
    "name": string,        // 환자 이름
    "age": number          // 환자 나이(만 나이)
  },
  "diagnosis": string,     // 주(主) 진단명 및 상병코드
  "main_symptoms": string, // 주요 증상 요약
  "prescribed_drugs": [    // 처방 약물 목록(없으면 빈 배열)
    {
      "name": string,      // 약품명 또는 성분명
      "dosage": string,    // 용량·용법(예: "500 mg 1일 3회")
      "purpose": string    // 주요 효능·작용
    }
  ],
  "detailed_analysis": string, // 검사 수치·위험 요인에 대한 상세 해석
  "treatment_plan": string,    // 권장 치료 방안(약물·생활습관·추적검사 등)
  "helpful_foods": [string],    // 질환 관리에 도움이 되는 음식 이름 목록
  "source": [string],   // 출처
}

`;

/**
 * 업로드된 파일이 진료 기록인지 확인
 */
async function checkIfMedicalRecord(fileBuffer, mimeType) {
  try {
    let content = '';
    
    // PDF 파일 처리
    if (mimeType === 'application/pdf') {
      const pdfData = await pdfParse(fileBuffer);
      content = pdfData.text;
    } 
    // 이미지 파일 처리 (JPG, PNG)
    else if (mimeType.startsWith('image/')) {
      // OpenAI Vision API로 이미지 분석
      const base64Image = fileBuffer.toString('base64');
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "이 이미지가 의료 진료 기록(처방전, 진단서, 검사 결과지, 의무 기록 등)인지 확인해주세요. 단순히 '예' 또는 '아니오'로만 답변해주세요."
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
        max_tokens: 10
      });
      
      const result = response.choices[0].message.content.toLowerCase();
      return result.includes('예') || result.includes('yes');
    }
    
    // 텍스트 기반 진료 기록 확인 (PDF에서 추출된 텍스트)
    if (content) {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: `다음 텍스트가 의료 진료 기록(처방전, 진단서, 검사 결과지, 의무 기록 등)인지 확인해주세요. 단순히 '예' 또는 '아니오'로만 답변해주세요.\n\n텍스트: ${content.substring(0, 1000)}`
          }
        ],
        max_tokens: 10
      });
      
      const result = response.choices[0].message.content.toLowerCase();
      return result.includes('예') || result.includes('yes');
    }
    
    return false;
  } catch (error) {
    console.error('진료 기록 확인 중 오류:', error);
    return false;
  }
}

/**
 * 진료 기록 분석 (구조화된 JSON 리포트 생성)
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
            content: MEDICAL_DOCUMENT_SYSTEM_PROMPT
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "첨부된 의료 문서를 분석하여 구조화된 진료 리포트 JSON을 생성해주세요."
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
            content: MEDICAL_DOCUMENT_SYSTEM_PROMPT
          },
          {
            role: "user",
            content: `다음 의료 문서를 분석하여 구조화된 진료 리포트 JSON을 생성해주세요:\n\n${content}`
          }
        ],
        stream: true,
        max_tokens: 3000,
        temperature: 0.1
      });
    }
  } catch (error) {
    console.error('진료 기록 분석 중 오류:', error);
    throw error;
  }
}

module.exports = {
  checkIfMedicalRecord,
  analyzeMedicalRecord
}; 