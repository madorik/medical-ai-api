const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const OpenAI = require('openai');
const { verifyToken } = require('../utils/auth-utils');
const { supabase } = require('../config/supabase-config');
const { checkIfMedicalRecord, analyzeMedicalRecord } = require('../services/medical-analysis-service');
const { formatTextToHtml, formatMedicalAnalysis } = require('../utils/text-formatter');

const router = express.Router();

// OpenAI 클라이언트 초기화
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 메모리 스토리지 설정 (파일을 저장하지 않고 처리만)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB 제한
  },
  fileFilter: (req, file, cb) => {
    // 한글 파일명 UTF-8 인코딩 처리
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    
    // PDF 파일만 허용
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('PDF 파일만 업로드 가능합니다.'), false);
    }
  }
});

// 파일 내용 추출 함수
async function extractFileContent(buffer, mimetype) {
  try {
    if (mimetype === 'application/pdf') {
      const data = await pdf(buffer);
      return {
        content: data.text,
        metadata: {
          pages: data.numpages,
          info: data.info
        }
      };
    }
    throw new Error('지원하지 않는 파일 형식입니다.');
  } catch (error) {
    console.error('파일 내용 추출 실패:', error);
    throw error;
  }
}

// 진료 기록 업로드, 채팅방 생성 및 AI 분석
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '파일을 선택해주세요.'
      });
    }

    const userId = req.user.id;
    const file = req.file;
    const originalFilename = file.originalname;
    
    // 파일 내용 추출
    const extractedData = await extractFileContent(file.buffer, file.mimetype);
    
    // 진료 기록인지 확인
    const isMedicalRecord = await checkIfMedicalRecord(file.buffer, file.mimetype);
    if (!isMedicalRecord) {
      return res.status(400).json({
        success: false,
        error: '진료 기록이 아닙니다. 진료 기록(처방전, 진단서, 검사 결과지 등)만 업로드할 수 있습니다.'
      });
    }
    
    // 채팅방 제목 생성 (파일명에서 확장자 제거)
    const chatRoomTitle = originalFilename.replace(/\.[^/.]+$/, '');
    
    // 1. 채팅방 생성 (UTF-8 인코딩 보장)
    console.log('Creating chat room for user:', userId);
    const chatRoomData = {
      user_id: userId,
      title: Buffer.from(chatRoomTitle, 'utf8').toString('utf8'),
      original_filename: Buffer.from(originalFilename, 'utf8').toString('utf8')
    };
    
    const { data: chatRoom, error: chatRoomError } = await supabase
      .from('chat_rooms')
      .insert(chatRoomData)
      .select()
      .single();

    console.log('Chat room creation result:', { chatRoom, chatRoomError });
    if (chatRoomError) throw chatRoomError;

    // 2. 진료 기록 저장 (UTF-8 인코딩 보장)
    console.log('Creating medical record for chat room:', chatRoom.id);
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

    console.log('Medical record creation result:', { medicalRecord, recordError });
    if (recordError) throw recordError;

    // 3. AI 분석 수행
    console.log('Starting AI analysis for file:', originalFilename);
    let analysisResult = '';
    
    try {
      const stream = await analyzeMedicalRecord(file.buffer, file.mimetype);
      
      // 스트리밍 결과를 모두 수집
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          analysisResult += content;
        }
      }
      
      console.log('AI analysis completed, length:', analysisResult.length);
      
      // 4. 분석 결과를 채팅 메시지로 저장 (UTF-8 인코딩 보장)
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
          content: Buffer.from(analysisResult || '분석을 완료했습니다. 궁금한 점이 있으시면 언제든 물어보세요.', 'utf8').toString('utf8'),
          is_emergency: false
        }
      ];
      
      await supabase.from('chat_messages').insert(chatMessages);

      // 5. 분석 결과를 진료 기록에 업데이트
      let summaryText = '';
      
      try {
        // 정말 핵심만 담은 짧은 요약 생성 (1-2줄)
        const summaryResponse = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: `다음 의료 분석을 1-2문장으로 핵심만 요약해주세요. 진단명과 주요 권장사항만 포함하세요:

${analysisResult}

예시: "혈압 전단계, 공복혈당 장애 확인. 운동과 식이조절 필요"`
            }
          ],
          stream: false,
          max_tokens: 80,
          temperature: 0.2
        });
        
        summaryText = summaryResponse.choices[0].message.content.trim();
        
        // 요약이 너무 길면 자르기
        if (summaryText.length > 100) {
          summaryText = summaryText.substring(0, 97) + '...';
        }
        
      } catch (summaryError) {
        console.error('요약 생성 실패:', summaryError);
        // 요약 실패 시 간단한 fallback (핵심 키워드만 추출)
        const keywordMatch = analysisResult.match(/(?:진단|소견|의심|확인)[^.]*[.]/g);
        summaryText = keywordMatch ? keywordMatch.slice(0, 2).join(' ').substring(0, 100) : '진료 기록 분석 완료';
      }
      
      await supabase
        .from('medical_records')
        .update({ 
          ai_analysis: Buffer.from(analysisResult, 'utf8').toString('utf8'),
          summary: Buffer.from(summaryText, 'utf8').toString('utf8')
        })
        .eq('id', medicalRecord.id);

    } catch (analysisError) {
      console.error('AI 분석 실패:', analysisError);
      
      // 분석 실패 시에도 기본 메시지 저장 (UTF-8 인코딩 보장)
      const fallbackMessages = [
        {
          chat_room_id: chatRoom.id,
          user_id: userId,
          message_type: 'user',
          content: Buffer.from(`"${originalFilename}" 파일이 업로드되었습니다.`, 'utf8').toString('utf8'),
          is_emergency: false
        },
        {
          chat_room_id: chatRoom.id,
          user_id: userId,
          message_type: 'assistant',
          content: Buffer.from('파일 업로드가 완료되었습니다. AI 분석 중 일시적인 문제가 발생했지만, 파일 내용은 정상적으로 저장되었습니다. 궁금한 점이 있으시면 언제든 물어보세요.', 'utf8').toString('utf8'),
          is_emergency: false
        }
      ];
      
      await supabase.from('chat_messages').insert(fallbackMessages);
    }

    res.json({
      success: true,
      message: '진료 기록이 성공적으로 업로드되고 분석되었습니다.',
      data: {
        chatRoom: {
          id: chatRoom.id,
          title: chatRoom.title,
          created_at: chatRoom.created_at
        },
        medicalRecord: {
          id: medicalRecord.id,
          title: medicalRecord.title,
          file_type: medicalRecord.file_type,
          created_at: medicalRecord.created_at
        },
        roomId: chatRoom.id, // 프론트엔드에서 사용할 room ID
        redirectUrl: `/medical/chat-rooms/${chatRoom.id}` // 리다이렉트 URL
      }
    });

  } catch (error) {
    console.error('진료 기록 업로드 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message || '진료 기록 업로드에 실패했습니다.'
    });
  }
});

// 채팅방 목록 조회
router.get('/chat-rooms', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    // 채팅방 목록 조회
    const { data: chatRooms, error, count } = await supabase
      .from('chat_rooms')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // 간단한 채팅방 정보만 응답 (id, title, created_at)
    const simpleChatRooms = chatRooms.map(room => ({
      id: room.id,
      title: room.title,
      created_at: room.created_at
    }));

    res.json({
      success: true,
      chatRooms: simpleChatRooms,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalCount: count,
        hasNext: count > offset + limit,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('채팅방 목록 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '채팅방 목록 조회에 실패했습니다.'
    });
  }
});

// 특정 채팅방 조회 (모든 관련 정보 포함)
router.get('/chat-rooms/:roomId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const roomId = req.params.roomId;

    // 채팅방 정보 조회
    const { data: chatRoom, error: roomError } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('id', roomId)
      .eq('user_id', userId)
      .single();

    if (roomError) throw roomError;
    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        error: '채팅방을 찾을 수 없습니다.'
      });
    }

    // 진료 기록 조회
    const { data: medicalRecords, error: recordsError } = await supabase
      .from('medical_records')
      .select('*')
      .eq('chat_room_id', roomId)
      .eq('user_id', userId);

    if (recordsError) throw recordsError;

    // 채팅 메시지 조회
    const { data: chatMessages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_room_id', roomId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (messagesError) throw messagesError;

    // 응답 데이터 구성
    const response = {
      chatRoom: {
        ...chatRoom,
        medicalRecord: medicalRecords?.[0] || null,
        messages: chatMessages || [],
        messageCount: chatMessages?.length || 0,
        hasAnalysis: !!(medicalRecords?.[0]?.ai_analysis),
        lastMessageAt: chatMessages?.length > 0 
          ? chatMessages[chatMessages.length - 1].created_at 
          : chatRoom.created_at
      }
    };

    res.json({
      success: true,
      ...response
    });

  } catch (error) {
    console.error('채팅방 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '채팅방 조회에 실패했습니다.'
    });
  }
});

// 채팅방에 메시지 저장
router.post('/chat-rooms/:roomId/messages', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const roomId = req.params.roomId;
    const { userMessage, aiResponse, isEmergency = false } = req.body;

    if (!userMessage || !aiResponse) {
      return res.status(400).json({
        success: false,
        error: '사용자 메시지와 AI 응답이 모두 필요합니다.'
      });
    }

    // 채팅방 존재 및 권한 확인
    const { data: chatRoom, error: roomError } = await supabase
      .from('chat_rooms')
      .select('id')
      .eq('id', roomId)
      .eq('user_id', userId)
      .single();

    if (roomError || !chatRoom) {
      return res.status(404).json({
        success: false,
        error: '채팅방을 찾을 수 없습니다.'
      });
    }

    // 사용자 메시지와 AI 응답을 순차적으로 저장
    const messages = [
      {
        chat_room_id: roomId,
        user_id: userId,
        message_type: 'user',
        content: userMessage,
        is_emergency: isEmergency
      },
      {
        chat_room_id: roomId,
        user_id: userId,
        message_type: 'assistant',
        content: aiResponse,
        is_emergency: isEmergency
      }
    ];

    const { data: savedMessages, error: saveError } = await supabase
      .from('chat_messages')
      .insert(messages)
      .select();

    if (saveError) throw saveError;

    res.json({
      success: true,
      message: '메시지가 저장되었습니다.',
      data: savedMessages
    });

  } catch (error) {
    console.error('메시지 저장 실패:', error);
    res.status(500).json({
      success: false,
      error: '메시지 저장에 실패했습니다.'
    });
  }
});

// 진료 기록 목록 조회
router.get('/records', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const { data: records, error, count } = await supabase
      .from('medical_records')
      .select(`
        id, title, original_filename, file_type, summary, 
        created_at, updated_at,
        chat_rooms(id, title)
      `, { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    res.json({
      success: true,
      records: records || [],
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        totalCount: count,
        hasNext: count > offset + limit,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('진료 기록 목록 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '진료 기록 목록 조회에 실패했습니다.'
    });
  }
});

// 특정 진료 기록 조회
router.get('/records/:recordId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const recordId = req.params.recordId;

    const { data: record, error } = await supabase
      .from('medical_records')
      .select(`
        *,
        chat_rooms(id, title)
      `)
      .eq('id', recordId)
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    if (!record) {
      return res.status(404).json({
        success: false,
        error: '진료 기록을 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      record
    });

  } catch (error) {
    console.error('진료 기록 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '진료 기록 조회에 실패했습니다.'
    });
  }
});

// 채팅방 삭제
router.delete('/chat-rooms/:roomId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const roomId = req.params.roomId;

    // 채팅방 삭제 (CASCADE로 관련 메시지와 진료 기록도 함께 삭제됨)
    const { error } = await supabase
      .from('chat_rooms')
      .delete()
      .eq('id', roomId)
      .eq('user_id', userId);

    if (error) throw error;

    res.json({
      success: true,
      message: '채팅방이 삭제되었습니다.'
    });

  } catch (error) {
    console.error('채팅방 삭제 실패:', error);
    res.status(500).json({
      success: false,
      error: '채팅방 삭제에 실패했습니다.'
    });
  }
});

// 진료 기록 삭제
router.delete('/records/:recordId', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const recordId = req.params.recordId;

    const { error } = await supabase
      .from('medical_records')
      .delete()
      .eq('id', recordId)
      .eq('user_id', userId);

    if (error) throw error;

    res.json({
      success: true,
      message: '진료 기록이 삭제되었습니다.'
    });

  } catch (error) {
    console.error('진료 기록 삭제 실패:', error);
    res.status(500).json({
      success: false,
      error: '진료 기록 삭제에 실패했습니다.'
    });
  }
});

module.exports = router; 