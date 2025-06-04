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
- 부정확하거나 추측성 정보 제공`;

// 채팅 히스토리 저장
async function saveChatHistory(userId, userMessage, aiResponse) {
  try {
    const { error } = await supabase
      .from('chat_history')
      .insert({
        user_id: userId,
        user_message: userMessage,
        ai_response: aiResponse,
        created_at: new Date().toISOString()
      });
    
    if (error) throw error;
  } catch (error) {
    console.error('채팅 히스토리 저장 실패:', error);
  }
}

// 채팅 히스토리 조회
router.get('/history', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const { data: chatHistory, error } = await supabase
      .from('chat_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(50); // 최근 50개 대화만
    
    if (error) throw error;
    
    res.json({
      success: true,
      chatHistory: chatHistory || []
    });
    
  } catch (error) {
    console.error('채팅 히스토리 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '채팅 히스토리 조회에 실패했습니다.'
    });
  }
});

// SSE 스트리밍 채팅
router.post('/stream', verifyToken, async (req, res) => {
  try {
    const { message, chatHistory = [] } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '메시지를 입력해주세요.'
      });
    }
    
    // SSE 헤더 설정
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });
    
    // 대화 히스토리 구성
    const messages = [
      { role: 'system', content: MEDICAL_SYSTEM_PROMPT },
      ...chatHistory.map(chat => ([
        { role: 'user', content: chat.userMessage },
        { role: 'assistant', content: chat.aiResponse }
      ])).flat(),
      { role: 'user', content: message }
    ];
    
    let fullResponse = '';
    
    try {
      // OpenAI 스트리밍 요청
      const stream = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
        stream: true,
        temperature: 0.7,
        max_tokens: 1000
      });
      
      // 스트리밍 응답 처리
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          // SSE 형식으로 전송
          res.write(`data: ${JSON.stringify({ 
            content, 
            done: false 
          })}\n\n`);
        }
      }
      
      // 완료 신호 전송
      res.write(`data: ${JSON.stringify({ 
        content: '', 
        done: true 
      })}\n\n`);
      
      // 채팅 히스토리 저장
      await saveChatHistory(req.user.id, message, fullResponse);
      
    } catch (openaiError) {
      console.error('OpenAI API 오류:', openaiError);
      res.write(`data: ${JSON.stringify({ 
        error: 'AI 응답 생성 중 오류가 발생했습니다.',
        done: true 
      })}\n\n`);
    }
    
    res.end();
    
  } catch (error) {
    console.error('채팅 스트리밍 오류:', error);
    res.status(500).json({
      success: false,
      error: '채팅 서비스 오류가 발생했습니다.'
    });
  }
});

// 일반 채팅 (스트리밍 없음)
router.post('/message', verifyToken, async (req, res) => {
  try {
    const { message, chatHistory = [] } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '메시지를 입력해주세요.'
      });
    }
    
    // 대화 히스토리 구성
    const messages = [
      { role: 'system', content: MEDICAL_SYSTEM_PROMPT },
      ...chatHistory.map(chat => ([
        { role: 'user', content: chat.userMessage },
        { role: 'assistant', content: chat.aiResponse }
      ])).flat(),
      { role: 'user', content: message }
    ];
    
    // OpenAI API 호출
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 1000
    });
    
    const aiResponse = completion.choices[0].message.content;
    
    // 채팅 히스토리 저장
    await saveChatHistory(req.user.id, message, aiResponse);
    
    res.json({
      success: true,
      response: aiResponse,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('채팅 메시지 처리 오류:', error);
    res.status(500).json({
      success: false,
      error: 'AI 응답 생성에 실패했습니다.'
    });
  }
});

// 채팅 삭제
router.delete('/history', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const { error } = await supabase
      .from('chat_history')
      .delete()
      .eq('user_id', userId);
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: '채팅 히스토리가 삭제되었습니다.'
    });
    
  } catch (error) {
    console.error('채팅 히스토리 삭제 실패:', error);
    res.status(500).json({
      success: false,
      error: '채팅 히스토리 삭제에 실패했습니다.'
    });
  }
});

module.exports = router; 