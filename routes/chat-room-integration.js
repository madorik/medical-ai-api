const express = require('express');
const OpenAI = require('openai');
const { verifyToken } = require('../utils/auth-utils');
const { supabase } = require('../config/supabase-config');

const router = express.Router();

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

// 특정 채팅방에서 스트리밍 채팅
router.post('/chat-rooms/:roomId/stream', verifyToken, async (req, res) => {
  try {
    const { message } = req.body;
    const roomId = req.params.roomId;
    const userId = req.user.id;
    
    // 메시지 검증
    const validation = validateMessage(message);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }
    
    const cleanMessage = validation.message;
    
    // 채팅방 존재 및 권한 확인
    const { data: chatRoom, error: roomError } = await supabase
      .from('chat_rooms')
      .select('*, medical_records(*)')
      .eq('id', roomId)
      .eq('user_id', userId)
      .single();

    if (roomError || !chatRoom) {
      return res.status(404).json({
        success: false,
        error: '채팅방을 찾을 수 없습니다.'
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
    
    // 응급 상황 감지
    const isEmergency = detectEmergency(cleanMessage);
    let systemPrompt = MEDICAL_SYSTEM_PROMPT;
    
    // 진료 기록 정보를 컨텍스트에 추가
    if (chatRoom.medical_records && chatRoom.medical_records.length > 0) {
      const medicalRecord = chatRoom.medical_records[0];
      systemPrompt += `\n\n진료 기록 컨텍스트:\n파일명: ${medicalRecord.original_filename}\n내용: ${medicalRecord.file_content.substring(0, 1000)}...`;
    }
    
    if (isEmergency) {
      systemPrompt += `\n\n⚠️ 응급 상황이 감지되었습니다. 이 경우 즉시 119에 신고하거나 가까운 응급실을 방문하도록 강력히 권유하고, 의료 조치가 우선임을 강조하세요.`;
    }
    
    // 기존 채팅 히스토리 조회 (최근 10개)
    const { data: recentMessages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (messagesError) {
      console.error('채팅 히스토리 조회 실패:', messagesError);
    }

    // 메시지 히스토리 구성
    const messages = [{ role: 'system', content: systemPrompt }];
    
    if (recentMessages) {
      // 시간순으로 정렬하고 대화 형식으로 변환
      recentMessages.reverse().forEach(msg => {
        messages.push({
          role: msg.message_type === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      });
    }
    
    // 현재 메시지 추가
    messages.push({ role: 'user', content: cleanMessage });
    
    let fullResponse = '';
    
    try {
      // OpenAI 스트리밍 요청
      const stream = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: messages,
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
            done: false,
            isEmergency 
          })}\n\n`);
        }
      }
      
      // 완료 신호 전송
      res.write(`data: ${JSON.stringify({ 
        content: '', 
        done: true,
        isEmergency,
        timestamp: new Date().toISOString()
      })}\n\n`);
      
      // 채팅 메시지 저장 (UTF-8 인코딩 보장)
      const messagesToSave = [
        {
          chat_room_id: roomId,
          user_id: userId,
          message_type: 'user',
          content: Buffer.from(cleanMessage, 'utf8').toString('utf8'),
          is_emergency: isEmergency
        },
        {
          chat_room_id: roomId,
          user_id: userId,
          message_type: 'assistant',
          content: Buffer.from(fullResponse, 'utf8').toString('utf8'),
          is_emergency: isEmergency
        }
      ];
      
      await supabase.from('chat_messages').insert(messagesToSave);
      
      // 채팅방 업데이트 시간 갱신
      await supabase
        .from('chat_rooms')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', roomId);
      
    } catch (openaiError) {
      console.error('OpenAI API 오류:', openaiError);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: 'AI 응답 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        done: true
      })}\n\n`);
    }
    
    res.end();
    
  } catch (error) {
    console.error('채팅방 스트리밍 오류:', error);
    res.status(500).json({
      success: false,
      error: '채팅 서비스 오류가 발생했습니다.'
    });
  }
});

// 특정 채팅방에서 일반 채팅
router.post('/chat-rooms/:roomId/message', verifyToken, async (req, res) => {
  try {
    const { message } = req.body;
    const roomId = req.params.roomId;
    const userId = req.user.id;
    
    // 메시지 검증
    const validation = validateMessage(message);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: validation.error
      });
    }
    
    const cleanMessage = validation.message;
    
    // 채팅방 존재 및 권한 확인
    const { data: chatRoom, error: roomError } = await supabase
      .from('chat_rooms')
      .select('*, medical_records(*)')
      .eq('id', roomId)
      .eq('user_id', userId)
      .single();

    if (roomError || !chatRoom) {
      return res.status(404).json({
        success: false,
        error: '채팅방을 찾을 수 없습니다.'
      });
    }
    
    // 응급 상황 감지
    const isEmergency = detectEmergency(cleanMessage);
    let systemPrompt = MEDICAL_SYSTEM_PROMPT;
    
    // 진료 기록 정보를 컨텍스트에 추가
    if (chatRoom.medical_records && chatRoom.medical_records.length > 0) {
      const medicalRecord = chatRoom.medical_records[0];
      systemPrompt += `\n\n진료 기록 컨텍스트:\n파일명: ${medicalRecord.original_filename}\n내용: ${medicalRecord.file_content.substring(0, 1000)}...`;
    }
    
    if (isEmergency) {
      systemPrompt += `\n\n⚠️ 응급 상황이 감지되었습니다. 이 경우 즉시 119에 신고하거나 가까운 응급실을 방문하도록 강력히 권유하고, 의료 조치가 우선임을 강조하세요.`;
    }
    
    // 기존 채팅 히스토리 조회 (최근 10개)
    const { data: recentMessages } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(20);

    // 메시지 히스토리 구성
    const messages = [{ role: 'system', content: systemPrompt }];
    
    if (recentMessages) {
      recentMessages.reverse().forEach(msg => {
        messages.push({
          role: msg.message_type === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      });
    }
    
    messages.push({ role: 'user', content: cleanMessage });
    
    // OpenAI API 호출
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 3000,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });
    
    const aiResponse = completion.choices[0].message.content;
    
    // 채팅 메시지 저장 (UTF-8 인코딩 보장)
    const messagesToInsert = [
      {
        chat_room_id: roomId,
        user_id: userId,
        message_type: 'user',
        content: Buffer.from(cleanMessage, 'utf8').toString('utf8'),
        is_emergency: isEmergency
      },
      {
        chat_room_id: roomId,
        user_id: userId,
        message_type: 'assistant',
        content: Buffer.from(aiResponse, 'utf8').toString('utf8'),
        is_emergency: isEmergency
      }
    ];
    
    await supabase.from('chat_messages').insert(messagesToInsert);
    
    // 채팅방 업데이트 시간 갱신
    await supabase
      .from('chat_rooms')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', roomId);
    
    res.json({
      success: true,
      response: aiResponse,
      isEmergency,
      timestamp: new Date().toISOString(),
      usage: completion.usage
    });
    
  } catch (error) {
    console.error('채팅 메시지 처리 오류:', error);
    res.status(500).json({
      success: false,
      error: 'AI 응답 생성에 실패했습니다.'
    });
  }
});

module.exports = router; 