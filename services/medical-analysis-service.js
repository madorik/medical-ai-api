const OpenAI = require('openai');
const pdfParse = require('pdf-parse');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
 * 진료 기록 분석 (스트리밍) - 테스트용 간단 버전
 */
async function analyzeMedicalRecord(fileBuffer, mimeType) {
  try {
    let content = '';
    
    // PDF 파일 처리
    if (mimeType === 'application/pdf') {
      const pdfData = await pdfParse(fileBuffer);
      content = pdfData.text;
    }
    
    const prompt = `
다음 진료 기록을 간단히 분석해주세요:

분석할 내용: ${content ? content.substring(0, 500) : '[이미지 파일]'}

다음 형식으로 답변해주세요:
1. 환자 정보: (이름, 나이 등)
2. 진단명: 
3. 주요 증상:
4. 처방약:
5. 간단 요약:

간결하게 답변해주세요.
`;

    // 이미지 파일인 경우 Vision API 사용
    if (mimeType.startsWith('image/')) {
      const base64Image = fileBuffer.toString('base64');
      return openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
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
        max_tokens: 200
      });
    } else {
      // 텍스트 기반 분석
      return openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        stream: true,
        max_tokens: 200
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