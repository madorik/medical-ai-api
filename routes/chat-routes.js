const express = require('express');
const OpenAI = require('openai');
const { verifyToken } = require('../utils/auth-utils');
const { supabase, getAnalysisResultsByUser, getChatRoomById } = require('../config/supabase-config');
const { CATEGORY_NAMES_KR } = require('../utils/medical-document-categories');

const router = express.Router();

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * 채팅방의 의료 분석 결과를 시스템 프롬프트에 포함시키는 함수
 */
async function buildPersonalizedSystemPrompt(userId, basePrompt, roomId = null) {
  try {
    let medicalContext = '';
    
    if (roomId) {
      // roomId가 있으면 해당 채팅방의 분석 결과만 조회
      const chatRoom = await getChatRoomById(roomId, userId);
      
      if (chatRoom && chatRoom.medical_analysis) {
        const analysis = chatRoom.medical_analysis;
        const analysisDate = new Date(analysis.created_at).toLocaleDateString('ko-KR');
        const model = analysis.model || 'AI';
        const documentTypeName = CATEGORY_NAMES_KR[analysis.document_type] || '의료 문서';
        
        medicalContext = `현재 채팅방의 의료 문서 분석 결과:
[${analysisDate}] ${documentTypeName} - ${model} 분석
요약: ${analysis.summary}

${analysis.result ? `상세 분석 내용:
${analysis.result}` : ''}`;
      } else {
        // 채팅방은 있지만 분석 결과가 없는 경우
        return basePrompt;
      }
    } else {
      // roomId가 없으면 사용자의 최근 의료 분석 결과 조회 (최대 5개)
      const recentAnalyses = await getAnalysisResultsByUser(userId, 5, 0);
      
      if (!recentAnalyses || recentAnalyses.length === 0) {
        return basePrompt;
      }
      
      // 의료 분석 요약 정보를 시스템 프롬프트에 추가
      medicalContext = recentAnalyses.map((analysis, index) => {
        const analysisDate = new Date(analysis.created_at).toLocaleDateString('ko-KR');
        const model = analysis.model || 'AI';
        const documentTypeName = CATEGORY_NAMES_KR[analysis.document_type] || '의료 문서';
        return `${index + 1}. [${analysisDate}] ${documentTypeName} - ${model} 분석: ${analysis.summary}`;
      }).join('\n');

      medicalContext = `사용자의 최근 의료 문서 분석 결과들:
${medicalContext}`;
    }

    return basePrompt + `

다음은 이 사용자의 의료 문서 분석 결과입니다. 이 정보를 참고하여 더 개인화된 의료 상담을 제공해주세요:
${medicalContext}

상담 시 활용 방법:
- 위 분석 결과와 관련된 질문이나 증상에 대해서는 구체적으로 참고하여 답변하세요
- 기존 진단이나 처방과 연관지어 조언할 수 있습니다  
- 하지만 여전히 새로운 진단을 내리거나 약물을 추천하지는 마세요
- 분석 결과를 보니... 같은 방식으로 자연스럽게 참고하세요
- 분석된 날짜를 고려하여 최근 정보를 우선적으로 참고하세요
- 사용자가 이전 분석과 관련된 질문을 하지 않더라도, 관련성이 있다면 자연스럽게 언급해주세요
`;
    
  } catch (error) {
    console.error('의료 분석 결과 조회 중 오류:', error);
    // 오류가 발생해도 기본 프롬프트는 사용
    return basePrompt;
  }
}

// 의료 상담 시스템 프롬프트
const MEDICAL_SYSTEM_PROMPT = `
당신은 신뢰할 수 있는 의료 상담 AI입니다.  
역할은 단순한 정보 전달자가 아닌, 사용자의 건강을 케어하기 위해 도움을 주는 전문 의학 상담자입니다.

목표:
- 사용자가 불편함을 편하게 털어놓을 수 있도록 친근하고 안정된 분위기를 만들어 주세요.  
- 정확한 정보와 행동 권장을 제공해야 합니다.

대화 스타일 가이드:
- 말투는 편안한 존댓말을 사용하세요.  
- 정보는 대화 안에 자연스럽게 녹여서 설명하세요.  

응답 흐름 예시:
1) 첫 응답:  
   - 사용자의 진료 기록을 확인하고 관련된 증상을 파악하여 답변하세요.

2) 확인 후 설명:  
   - 말씀하신 증상은 보통 이런 원인과도 관련이 있을 수 있어요.  
   - 기침이 계속되면 기관지염, 비염, 또는 위산역류와도 관련이 있을 수 있거든요.  

응급 상황 판단:
다음과 같은 증상이 나오면 대화 중단 후 즉시 응급 대응 안내:
- 키워드 예시: 심한 흉통, 호흡곤란, 의식 소실, 심한 출혈, 골절 의심, 중독, 알레르기 쇼크
- 응답 예시: 이건 응급 상황일 수 있어서 지금은 제가 도와드릴 수 있는 단계가 아니에요. 바로 119에 전화하시거나 응급실로 가셔야 해요. 주저하지 마세요.

금지사항:
- 진단 단정 짓기 (~입니다, ~로 보입니다 금지)  
- 약물 이름, 용량, 복용 방법 제시  
- 치료 방식을 구체적으로 지시  
- 과도한 위로 또는 근거 없는 추측  
- 사용자에게 불안, 죄책감을 주는 표현
- 응답 끝에 "혹시 다른 궁금한 점이 있으면 말씀해 주세요", "도움이 필요하면 언제든 말씀하세요", "추가 질문이 있으시면 말씀해 주세요" 같은 마무리 멘트 사용 금지

당신은 사람과 자연스럽게 대화하면서도, 전문가의 신중함과 윤리를 지닌 AI 의료 파트너입니다. 질문에 직접적으로 답변하고 자연스럽게 마무리하세요.
`;


// 메시지 검증 함수
function validateMessage(message) {
  if (!message || typeof message !== 'string') {
    return { isValid: false, error: '메시지를 입력해주세요.' };
  }
  
  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0) {
    return { isValid: false, error: '메시지를 입력해주세요.' };
  }
  
  if (trimmedMessage.length > 2000) {
    return { isValid: false, error: '메시지는 2000자 이하로 입력해주세요.' };
  }
  
  return { isValid: true, message: trimmedMessage };
}

// 응급 상황 감지 함수
function detectEmergency(message) {
  const emergencyKeywords = [
    '심한 흉통', '가슴이 아파', '숨이 안 쉬어', '호흡곤란', '의식을 잃', 
    '심한 출혈', '많이 피가', '골절', '뼈가 부러', '중독', '독을 먹', 
    '알레르기', '온몸이 부어', '응급', '119', '생명이 위험'
  ];
  
  return emergencyKeywords.some(keyword => 
    message.toLowerCase().includes(keyword.toLowerCase())
  );
}

// SSE 스트리밍 채팅
router.post('/stream', verifyToken, async (req, res) => {
  try {
    const { message, chatHistory = [], roomId } = req.body;
    const requestedModel = req.body.model || req.query.model;
    const userId = req.user.id; // JWT 토큰에서 사용자 ID 추출
    // 메시지 검증
    const validation = validateMessage(message);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }
    
    const cleanMessage = validation.message;
    
    // 모델 설정 (기본값 4o-mini)
    let modelName = requestedModel || '4o-mini';
    if (!modelName.startsWith('gpt-')) {
      modelName = `gpt-${modelName}`;
    }
    
    // SSE 헤더 설정
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // 사용자 의료 분석 기록을 포함한 개인화된 시스템 프롬프트 생성 (백그라운드 처리)
    const personalizedSystemPrompt = await buildPersonalizedSystemPrompt(userId, MEDICAL_SYSTEM_PROMPT, roomId);
    
    // 응급 상황 감지
    const isEmergency = detectEmergency(cleanMessage);
    let systemPrompt = personalizedSystemPrompt;
    
    if (isEmergency) {
      systemPrompt += `\n\n⚠️ 응급 상황이 감지되었습니다. 이 경우 즉시 119에 신고하거나 가까운 응급실을 방문하도록 강력히 권유하고, 의료 조치가 우선임을 강조하세요.`;
    }
    
    // 대화 히스토리 구성 (최근 10개만 사용)
    const recentHistory = chatHistory.slice(-10);
    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory.map(chat => ([
        { role: 'user', content: chat.user_message || chat.userMessage },
        { role: 'assistant', content: chat.ai_response || chat.aiResponse }
      ])).flat(),
      { role: 'user', content: cleanMessage }
    ];

    // Validate messages to ensure all have non-null content
    const validMessages = messages.filter(msg => msg.content !== null && msg.content !== undefined);
    
    let fullResponse = '';
    
    try {
      // OpenAI 스트리밍 요청
      const stream = await openai.chat.completions.create({
        model: modelName,
        messages: validMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 1024,
        presence_penalty: 0.6,
        frequency_penalty: 0.25
      });
      
      // 스트리밍 응답 처리
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          // SSE 형식으로 전송
          res.write(`data: ${JSON.stringify({ 
            content, 
            isEmergency,
            timestamp: new Date().toISOString()
          })}\n\n`);
        }
      }
      
      // 스트리밍 종료 신호 (개인화 정보 포함)
      const hasPersonalizedData = systemPrompt !== MEDICAL_SYSTEM_PROMPT;
      res.write(`data: ${JSON.stringify({ 
        type: 'end',
        fullResponse,
        isEmergency,
        timestamp: new Date().toISOString(),
        personalized: hasPersonalizedData,
        userId: userId
      })}\n\n`);
      
    } catch (openaiError) {
      console.error('OpenAI API 오류:', openaiError);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'AI 응답 생성 중 오류가 발생했습니다.',
        message: '잠시 후 다시 시도해주세요.'
      })}\n\n`);
    }
    
  } catch (error) {
    console.error('스트리밍 채팅 오류:', error);
    
    // 오류 시에도 SSE 형식으로 응답
    if (!res.headersSent) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });
    }
    
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: '채팅 서비스에 일시적인 문제가 발생했습니다.',
      message: '잠시 후 다시 시도해주세요.'
    })}\n\n`);
  } finally {
    res.end();
  }
});

module.exports = router; 