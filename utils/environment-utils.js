/**
 * 환경 감지 및 mock 데이터 유틸리티
 */

// localhost 환경인지 확인
function isLocalhost() {
  const nodeEnv = process.env.NODE_ENV;
  const port = process.env.PORT;
  const host = process.env.HOST;
  
  // NODE_ENV가 development이거나, localhost 관련 환경인 경우
  return nodeEnv === 'development' || 
         host === 'localhost' || 
         host === '127.0.0.1' ||
         port === '9001' ||
         !process.env.OPENAI_API_KEY ||
         process.env.USE_MOCK_AI === 'true';
}

// mock 의료 분석 응답 생성
function createMockMedicalAnalysis() {
  const mockResponses = [
    {
      patientInfo: "김건강 (35세, 남성)",
      diagnosis: "상기도 감염 (감기)",
      symptoms: ["발열 (38.2°C)", "두통", "콧물", "목 아픔"],
      medications: ["해열제 (아세트아미노펜 500mg)", "진해거담제", "비타민C"],
      summary: "일반적인 감기 증상으로 충분한 휴식과 수분 섭취가 필요합니다. 증상이 3-4일 내 호전되지 않으면 재방문 권장됩니다."
    },
    {
      patientInfo: "이건강 (28세, 여성)",
      diagnosis: "급성 위염",
      symptoms: ["복통", "속쓰림", "소화불량", "메스꺼움"],
      medications: ["위산분비억제제 (판토프라졸)", "위장관운동촉진제", "프로바이오틱스"],
      summary: "스트레스와 불규칙한 식습관으로 인한 급성 위염으로 진단됩니다. 규칙적인 식습관과 스트레스 관리가 중요합니다."
    }
  ];
  
  const randomResponse = mockResponses[Math.floor(Math.random() * mockResponses.length)];
  
  return `1. 환자 정보: ${randomResponse.patientInfo}
2. 진단명: ${randomResponse.diagnosis}
3. 주요 증상: ${randomResponse.symptoms.join(', ')}
4. 처방약: ${randomResponse.medications.join(', ')}
5. 간단 요약: ${randomResponse.summary}

※ 이는 localhost 환경에서 제공되는 mock 데이터입니다.`;
}

// mock 채팅 응답 생성
function createMockChatResponse(message) {
  const responses = [
    "안녕하세요! 의료 상담 AI입니다. 현재 localhost 환경에서 실행 중이므로 mock 응답을 제공합니다. 궁금한 증상이나 건강 관련 질문이 있으시면 언제든 말씀해 주세요.",
    "말씀해 주신 증상에 대해 이해했습니다. 일반적으로 이런 경우 충분한 휴식과 수분 섭취가 도움이 됩니다. 다만 이는 mock 응답이므로 실제 진료가 필요한 경우 전문의 상담을 받으시기 바랍니다.",
    "건강 관련 질문 감사합니다. 현재 개발 환경에서 mock 데이터로 응답드리고 있습니다. 실제 의료 상담이 필요하시다면 가까운 병원을 방문하시거나 전문의와 상담하시기 바랍니다.",
    "증상에 대해 말씀해 주셔서 감사합니다. 이는 개발용 mock 응답입니다. 실제 환경에서는 AI가 더 구체적이고 전문적인 의료 정보를 제공할 수 있습니다."
  ];
  
  // 응급상황 키워드 감지
  const emergencyKeywords = ['심한 흉통', '호흡곤란', '의식잃음', '심한 출혈', '응급'];
  const isEmergency = emergencyKeywords.some(keyword => 
    message.toLowerCase().includes(keyword.toLowerCase())
  );
  
  if (isEmergency) {
    return "⚠️ 응급 상황이 감지되었습니다. 즉시 119에 신고하거나 가까운 응급실을 방문하시기 바랍니다. 이는 mock 응답이지만, 실제 응급상황에서는 지체 없이 응급처치를 받으셔야 합니다.";
  }
  
  return responses[Math.floor(Math.random() * responses.length)];
}

// mock 스트리밍 생성기
async function* createMockStream(text) {
  const words = text.split(' ');
  
  for (const word of words) {
    yield word + ' ';
    // 실제 스트리밍처럼 약간의 지연 추가
    await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
  }
}

module.exports = {
  isLocalhost,
  createMockMedicalAnalysis,
  createMockChatResponse,
  createMockStream
}; 