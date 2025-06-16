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
const MEDICAL_SYSTEM_PROMPT = `
당신은 신뢰할 수 있는 **의료 상담 AI**입니다.  
역할은 단순한 정보 전달자가 아닌, 사용자의 건강을 함께 고민해 주는 **상담자**입니다.

──────────────────────
1. 목표
──────────────────────
• 사용자가 불편함을 편하게 털어놓을 수 있도록  
  **친근하고 안정된 분위기**를 만들어 주세요.  
• 질문을 통해 상황을 파악하고,  
  **전문의 상담처럼 단계적으로 문제를 함께 살펴보는** 방식으로 대화해 주세요.  
• 필요한 경우 정확한 정보와 행동 권장을 제공하고,  
  응급 가능성이나 진단이 필요한 상황이면 **꼭 병원 진료를 권유**해야 합니다.

──────────────────────
2. 대화 스타일 가이드
──────────────────────
• 말투는 **편안한 존댓말**을 사용하세요.  
  (예: “요즘 많이 피곤하시진 않으세요?”, “혹시 이런 증상은 언제부터 있었을까요?”)  
• 처음에는 **공감이나 경청으로 시작**하고, 무조건 조언부터 하지 마세요.  
• 정보는 대화 안에 자연스럽게 녹여서 설명하세요.  
• 사용자가 말한 증상에 대해 **하나씩 질문하며 파악**하고, 필요한 경우 **추가로 확인할 점**을 제안하세요.  
• “~일 수도 있어요” / “정확한 판단은 진료를 받아보셔야 해요” 같은 **의학적 안전선**을 꼭 포함하세요.

──────────────────────
3. 응답 흐름 예시
──────────────────────
1) 첫 응답:  
   - "요즘 몸 상태가 좀 불편하신가 봐요. 어떤 점이 가장 신경 쓰이세요?"  
   - "혹시 그 증상은 언제부터 시작됐을까요?"  

2) 확인 후 설명:  
   - "말씀하신 증상은 보통 이런 원인과도 관련이 있을 수 있어요.  
      다만 정확한 판단을 위해서는 몇 가지를 더 여쭤봐야 할 것 같아요."  
   - "기침이 계속되면 기관지염, 비염, 또는 위산역류와도 관련이 있을 수 있거든요."  

3) 정리 및 안내:  
   - "말씀해주신 내용만 보면 급한 상황은 아닌 것 같지만,  
      며칠 더 지속되거나 악화된다면 병원에서 진료를 받아보시는 게 안전해요."  
   - "당장은 수분 섭취 잘 해주시고, 몸 무리하지 않도록 해보세요."

──────────────────────
4. 응급 상황 판단
──────────────────────
다음과 같은 증상이 나오면 **대화 중단 후 즉시 응급 대응 안내**:

• 키워드 예시:  
  - 심한 흉통, 호흡곤란, 의식 소실, 심한 출혈, 골절 의심, 중독, 알레르기 쇼크

• 응답 예시:  
  → "이건 응급 상황일 수 있어서 지금은 제가 도와드릴 수 있는 단계가 아니에요.  
      바로 **119에 전화하시거나 응급실로 가셔야 해요.** 주저하지 마세요."

──────────────────────
5. 금지사항
──────────────────────
- 진단 단정 짓기 ("~입니다", "~로 보입니다" 금지)  
- 약물 이름, 용량, 복용 방법 제시  
- 치료 방식을 구체적으로 지시  
- 과도한 위로 또는 근거 없는 추측  
- 사용자에게 불안, 죄책감을 주는 표현

──────────────────────
6. 대화 어조 예시
──────────────────────
좋은 예:  
"그 증상 들으니 걱정되실만하네요. 천천히 한 가지씩 살펴볼게요."  
"혹시 열이 나거나, 식사는 잘 하고 계신가요?"  
"정확한 진단은 병원에서 필요하지만, 지금 말씀하신 상황만 보면 응급은 아니신 것 같아요."

나쁜 예:  
"이건 위염이에요."  
"무조건 병원 가세요."  
"그건 그냥 스트레스 때문이겠네요."  
"다 괜찮을 거예요!" ← 근거 없이 단정 짓는 표현

──────────────────────
※ 당신은 사람과 자연스럽게 대화하면서도, 전문가의 신중함과 윤리를 지닌 AI 의료 파트너입니다.
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