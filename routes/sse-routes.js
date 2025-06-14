const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const { verifyToken } = require('../utils/auth-utils');
const { supabase } = require('../config/supabase-config');
const { checkIfMedicalRecord, analyzeMedicalRecord } = require('../services/medical-analysis-service');
const { extractFileContent } = require('../utils/file-utils');

const router = express.Router();

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 의료 상담 시스템 프롬프트
const MEDICAL_SYSTEM_PROMPT = `
당신은 전문적인 의료 상담 AI 어시스턴트입니다.
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

// Multer 설정
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('PDF 파일만 업로드 가능합니다.'), false);
    }
  }
});

// 유틸리티 함수들
function validateMessage(message) {
  if (!message || typeof message !== 'string') {
    return { isValid: false, error: '메시지를 입력해주세요.' };
  }
  
  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0) {
    return { isValid: false, error: '메시지를 입력해주세요.' };
  }
  
  if (trimmedMessage.length > 500) {
    return { isValid: false, error: '메시지는 500자 이하로 입력해주세요.' };
  }
  
  return { isValid: true, message: trimmedMessage };
}

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

function sendSSEEvent(res, type, data) {
  res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
}

// 1. 파일 분석 SSE API
router.post('/analyze-stream', verifyToken, upload.single('file'), async (req, res) => {
  // SSE 헤더 설정
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  try {
    const userId = req.user.id;
    const { roomId: existingRoomId } = req.body;
    const file = req.file;

    if (!file) {
      sendSSEEvent(res, 'error', { message: '파일을 선택해주세요.' });
      return res.end();
    }

    const originalFilename = file.originalname;
    const chatRoomTitle = originalFilename.replace(/\.[^/.]+$/, '');

    // 1단계: 파일 검증
    sendSSEEvent(res, 'analysis_progress', { 
      status: 'validating', 
      message: '파일을 검증하는 중입니다...' 
    });

    const extractedData = await extractFileContent(file.buffer, file.mimetype);
    const isMedicalRecord = await checkIfMedicalRecord(file.buffer, file.mimetype);
    
    if (!isMedicalRecord) {
      sendSSEEvent(res, 'error', { 
        message: '진료 기록이 아닙니다. 진료 기록(처방전, 진단서, 검사 결과지 등)만 업로드할 수 있습니다.' 
      });
      return res.end();
    }

    // 2단계: 채팅방 생성 또는 기존 채팅방 사용
    let chatRoom;
    if (existingRoomId) {
      sendSSEEvent(res, 'analysis_progress', { 
        status: 'room_loading', 
        message: '기존 채팅방을 불러오는 중입니다...' 
      });

      const { data: existingRoom } = await supabase
        .from('chat_rooms')
        .select('*')
        .eq('id', existingRoomId)
        .eq('user_id', userId)
        .single();

      chatRoom = existingRoom;
    } else {
      sendSSEEvent(res, 'analysis_progress', { 
        status: 'room_creating', 
        message: '새 채팅방을 생성하는 중입니다...' 
      });

      const chatRoomData = {
        user_id: userId,
        title: Buffer.from(chatRoomTitle, 'utf8').toString('utf8'),
        original_filename: Buffer.from(originalFilename, 'utf8').toString('utf8')
      };

      const { data: newRoom, error: chatRoomError } = await supabase
        .from('chat_rooms')
        .insert(chatRoomData)
        .select()
        .single();

      if (chatRoomError) throw chatRoomError;
      chatRoom = newRoom;

      // 새 채팅방 생성 알림
      sendSSEEvent(res, 'room_created', {
        roomId: chatRoom.id,
        title: chatRoom.title,
        created_at: chatRoom.created_at
      });
    }

    // 3단계: 진료 기록 저장
    sendSSEEvent(res, 'analysis_progress', { 
      status: 'record_saving', 
      message: '진료 기록을 저장하는 중입니다...' 
    });

    const medicalRecordData = {
      user_id: userId,
      chat_room_id: chatRoom.id,
      title: Buffer.from(chatRoomTitle, 'utf8').toString('utf8'),
      original_filename: Buffer.from(originalFilename, 'utf8').toString('utf8'),
      file_content: Buffer.from(extractedData.content, 'utf8').toString('utf8'),
      file_type: file.mimetype,
      extracted_info: extractedData.metadata
    };

    const { data: medicalRecord, error: recordError } = await supabase
      .from('medical_records')
      .insert(medicalRecordData)
      .select()
      .single();

    if (recordError) throw recordError;

    // 4단계: AI 분석 시작
    sendSSEEvent(res, 'analysis_progress', { 
      status: 'ai_analyzing', 
      message: 'AI가 진료 기록을 분석하고 있습니다...' 
    });

    const stream = await analyzeMedicalRecord(file.buffer, file.mimetype);
    let analysisResult = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        analysisResult += content;
        sendSSEEvent(res, 'analysis_chunk', { 
          content,
          accumulated: analysisResult
        });
      }
    }

    // 5단계: 요약 생성
    sendSSEEvent(res, 'analysis_progress', { 
      status: 'summary_generating', 
      message: '요약을 생성하는 중입니다...' 
    });

    let summaryText = '';
    try {
      const summaryResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: `다음 의료 분석을 1-2문장으로 핵심만 요약해주세요:\n\n${analysisResult}`
        }],
        stream: false,
        max_tokens: 80,
        temperature: 0.2
      });
      
      summaryText = summaryResponse.choices[0].message.content.trim();
      if (summaryText.length > 100) {
        summaryText = summaryText.substring(0, 97) + '...';
      }
    } catch (summaryError) {
      console.error('요약 생성 실패:', summaryError);
      summaryText = '진료 기록 분석 완료';
    }

    // 6단계: 결과 저장
    await supabase
      .from('medical_records')
      .update({ 
        ai_analysis: Buffer.from(analysisResult, 'utf8').toString('utf8'),
        summary: Buffer.from(summaryText, 'utf8').toString('utf8')
      })
      .eq('id', medicalRecord.id);

    // 7단계: 초기 메시지 저장
    const initialMessage = `안녕하세요! "${originalFilename}" 파일이 업로드되었습니다. 진료 기록을 분석해드릴게요.`;
    
    const chatMessages = [
      {
        chat_room_id: chatRoom.id,
        user_id: userId,
        message_type: 'user',
        content: Buffer.from(initialMessage, 'utf8').toString('utf8'),
        is_emergency: false
      },
      {
        chat_room_id: chatRoom.id,
        user_id: userId,
        message_type: 'assistant',
        content: Buffer.from(analysisResult, 'utf8').toString('utf8'),
        is_emergency: false
      }
    ];
    
    await supabase.from('chat_messages').insert(chatMessages);

    // 완료 알림
    sendSSEEvent(res, 'analysis_complete', {
      roomId: chatRoom.id,
      summary: summaryText,
      analysisLength: analysisResult.length
    });

  } catch (error) {
    console.error('파일 분석 SSE 오류:', error);
    sendSSEEvent(res, 'error', { 
      message: error.message || '파일 분석 중 오류가 발생했습니다.' 
    });
  } finally {
    res.end();
  }
});

// 2. 메시지 전송 SSE API
router.post('/chat-stream', verifyToken, async (req, res) => {
  // SSE 헤더 설정
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  try {
    const { message, roomId: existingRoomId } = req.body;
    const userId = req.user.id;

    // 메시지 검증
    const validation = validateMessage(message);
    if (!validation.isValid) {
      sendSSEEvent(res, 'error', { message: validation.error });
      return res.end();
    }

    const cleanMessage = validation.message;
    const isEmergency = detectEmergency(cleanMessage);

    if (isEmergency) {
      sendSSEEvent(res, 'emergency_detected', { 
        message: '응급 상황이 감지되었습니다. 즉시 119에 신고하거나 응급실을 방문하세요.' 
      });
    }

    // 채팅방 처리
    let chatRoom;
    if (existingRoomId) {
      const { data: existingRoom } = await supabase
        .from('chat_rooms')
        .select('*, medical_records(*)')
        .eq('id', existingRoomId)
        .eq('user_id', userId)
        .single();

      chatRoom = existingRoom;
    } else {
      // 새 채팅방 생성
      const defaultTitle = `상담 ${new Date().toLocaleString('ko-KR')}`;
      
      const { data: newRoom, error: chatRoomError } = await supabase
        .from('chat_rooms')
        .insert({
          user_id: userId,
          title: Buffer.from(defaultTitle, 'utf8').toString('utf8'),
          original_filename: null
        })
        .select()
        .single();

      if (chatRoomError) throw chatRoomError;
      chatRoom = newRoom;

      sendSSEEvent(res, 'room_created', {
        roomId: chatRoom.id,
        title: chatRoom.title,
        created_at: chatRoom.created_at
      });
    }

    // 시스템 프롬프트 설정
    let systemPrompt = MEDICAL_SYSTEM_PROMPT;
    
    if (chatRoom.medical_records && chatRoom.medical_records.length > 0) {
      const medicalRecord = chatRoom.medical_records[0];
      systemPrompt += `\n\n진료 기록 컨텍스트:\n파일명: ${medicalRecord.original_filename}\n내용: ${medicalRecord.file_content.substring(0, 1000)}...`;
    }

    if (isEmergency) {
      systemPrompt += `\n\n⚠️ 응급 상황이 감지되었습니다. 즉시 119에 신고하거나 응급실 방문을 강력히 권유하세요.`;
    }

    // 채팅 히스토리 조회
    const { data: recentMessages } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_room_id', chatRoom.id)
      .order('created_at', { ascending: false })
      .limit(20);

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

    // OpenAI 스트리밍
    let fullResponse = '';
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 3000
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;
        sendSSEEvent(res, 'chat_chunk', { 
          content, 
          done: false,
          isEmergency 
        });
      }
    }

    // 완료 신호
    sendSSEEvent(res, 'chat_chunk', { 
      content: '', 
      done: true,
      isEmergency
    });

    // 메시지 저장
    const messagesToSave = [
      {
        chat_room_id: chatRoom.id,
        user_id: userId,
        message_type: 'user',
        content: Buffer.from(cleanMessage, 'utf8').toString('utf8'),
        is_emergency: isEmergency
      },
      {
        chat_room_id: chatRoom.id,
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
      .eq('id', chatRoom.id);

  } catch (error) {
    console.error('채팅 SSE 오류:', error);
    sendSSEEvent(res, 'error', { 
      message: error.message || '메시지 전송 중 오류가 발생했습니다.' 
    });
  } finally {
    res.end();
  }
});

// 3. 채팅방 목록 SSE API
router.get('/rooms-stream', verifyToken, async (req, res) => {
  // SSE 헤더 설정
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  try {
    const userId = req.user.id;

    // 초기 채팅방 목록 전송
    const { data: chatRooms } = await supabase
      .from('chat_rooms')
      .select('id, title, created_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    sendSSEEvent(res, 'rooms_list', { rooms: chatRooms || [] });

    // keep-alive를 위한 heartbeat (30초마다)
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    // 연결 종료 시 heartbeat 정리
    req.on('close', () => {
      clearInterval(heartbeat);
    });

    req.on('end', () => {
      clearInterval(heartbeat);
    });

  } catch (error) {
    console.error('채팅방 목록 SSE 오류:', error);
    sendSSEEvent(res, 'error', { 
      message: '채팅방 목록 조회 중 오류가 발생했습니다.' 
    });
    res.end();
  }
});

module.exports = router; 