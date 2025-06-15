const express = require('express');
const OpenAI = require('openai');
const { verifyToken } = require('../utils/auth-utils');
const { createClient } = require('@supabase/supabase-js');

const router = express.Router();

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Supabase 클라이언트 초기화
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// 의료 상담 시스템 프롬프트
const MEDICAL_SYSTEM_PROMPT = `당신은 전문적인 의료 상담 AI 어시스턴트입니다.

역할과 책임:
- 의료 정보 제공 및 건강 상담
- 정확하고 신뢰할 수 있는 의료 지식 기반 답변
- 응급상황 시 즉시 병원 방문 권유
- 진단이나 처방은 하지 않고, 전문의 상담 권장

답변 원칙:
1. 친근하고 이해하기 쉬운 한국어로 답변
2. 의학적 근거가 있는 정보만 제공
3. 불확실한 경우 전문의 상담 권유
4. 응급 증상 발견 시 즉시 병원 방문 강조
5. 개인정보 보호 및 의료 윤리 준수

금지사항:
- 확정적인 진단 제공
- 구체적인 약물 처방
- 의료진 대체 역할
- 부정확하거나 추측성 정보 제공

응급 상황 키워드: 심한 흉통, 호흡곤란, 의식잃음, 심한 출혈, 골절 의심, 중독, 알레르기 쇼크
이런 증상이 언급되면 즉시 119 신고 또는 응급실 방문을 강력히 권합니다.`;

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
    const { message, chatHistory = [] } = req.body;
    
    // 메시지 검증
    const validation = validateMessage(message);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }
    
    const cleanMessage = validation.message;
    
    // SSE 헤더 설정
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // 응급 상황 감지
    const isEmergency = detectEmergency(cleanMessage);
    let systemPrompt = MEDICAL_SYSTEM_PROMPT;
    
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
        model: 'gpt-4o-mini',
        messages: validMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 3000,
        presence_penalty: 0.1,
        frequency_penalty: 0.1
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
      
      // 스트리밍 종료 신호
      res.write(`data: ${JSON.stringify({ 
        type: 'end',
        fullResponse,
        isEmergency,
        timestamp: new Date().toISOString()
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