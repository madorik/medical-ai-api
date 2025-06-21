const { createClient } = require('@supabase/supabase-js');
const { encryptText, safeDecrypt } = require('../utils/encryption-utils');

// Supabase 설정
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'your-anon-key';

// 개발 환경에서는 service_role 키 사용 (RLS 우회)
const isDevelopment = process.env.NODE_ENV === 'development';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Supabase 클라이언트 생성
let supabase;

if (isDevelopment && supabaseServiceKey) {
  // 개발 환경: service_role 키로 RLS 우회
  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
} else {
  // 프로덕션 환경: 일반 anon 키 사용
  supabase = createClient(supabaseUrl, supabaseKey);
}

/**
 * 데이터베이스 연결 상태 확인
 */
async function testConnection() {
  try {
    // 간단한 쿼리로 연결 테스트
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    if (error && error.code !== 'PGRST116') { // 테이블이 없는 경우 제외
      console.error('Supabase 연결 실패:', error.message);
      return false;
    }
    
    console.log('✅ Supabase 연결 성공');
    return true;
  } catch (error) {
    console.error('Supabase 연결 테스트 실패:', error.message);
    return false;
  }
}

/**
 * RLS 상태 확인
 */
async function checkRLSStatus() {
  try {
    const { data, error } = await supabase.rpc('check_rls_status', {});
    
    if (error) {
      console.log('RLS 상태 확인 함수가 없습니다. 수동으로 확인하세요.');
      return null;
    }
    
    return data;
  } catch (error) {
    console.log('RLS 상태 확인 중 오류:', error.message);
    return null;
  }
}

/**
 * 개발용 사용자 생성 (RLS 우회)
 */
async function createUserDev(userData) {
  if (!isDevelopment) {
    throw new Error('이 함수는 개발 환경에서만 사용할 수 있습니다.');
  }
  
  try {
    const { data, error } = await supabase
      .from('users')
      .insert([userData])
      .select()
      .single();
    
    if (error) {
      console.error('개발용 사용자 생성 오류:', error);
      throw error;
    }
    
    console.log('✅ 개발용 사용자 생성 성공:', data.email);
    return data;
  } catch (error) {
    console.error('createUserDev 오류:', error);
    throw error;
  }
}

/**
 * 의료 분석 결과 저장
 */
async function saveAnalysisResult(analysisData) {
  try {
    // summary와 result를 암호화
    const encryptedSummary = encryptText(analysisData.summary);
    const encryptedResult = analysisData.result ? encryptText(analysisData.result) : null;
    
    const { data, error } = await supabase
      .from('medical_analysis')
      .insert([{
        user_id: analysisData.userId,
        room_id: analysisData.roomId || null,
        model: analysisData.model,
        summary: encryptedSummary, // 암호화된 summary 저장
        result: encryptedResult, // 암호화된 result 저장
        document_type: analysisData.documentType || 'other',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) {
      console.error('의료 분석 결과 저장 오류:', error);
      throw error;
    }
    
    console.log('✅ 의료 분석 결과 저장 성공 (암호화됨):', data.id);
    return data;
  } catch (error) {
    console.error('saveAnalysisResult 오류:', error);
    throw error;
  }
}

/**
 * 사용자별 분석 결과 조회
 */
async function getAnalysisResultsByUser(userId, limit = 10, offset = 0) {
  try {
    const { data, error } = await supabase
      .from('medical_analysis')
      .select('id, model, summary, result, document_type, created_at, room_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) {
      console.error('사용자별 분석 결과 조회 오류:', error);
      throw error;
    }
    
    // summary와 result를 복호화하여 반환
    const decryptedData = data.map(result => ({
      ...result,
      summary: safeDecrypt(result.summary), // 안전한 복호화 (기존 데이터 호환)
      result: result.result ? safeDecrypt(result.result) : null // result 복호화
    }));
    
    return decryptedData;
  } catch (error) {
    console.error('getAnalysisResultsByUser 오류:', error);
    throw error;
  }
}

/**
 * 새로운 채팅방 생성
 */
async function createChatRoom(userId, medicalAnalysisId = null, title = 'New Chat') {
  try {
    const { data, error } = await supabase
      .from('chat_room')
      .insert([{
        user_id: userId,
        medical_analysis_id: medicalAnalysisId,
        title: title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) {
      console.error('채팅방 생성 오류:', error);
      throw error;
    }
    
    console.log('✅ 채팅방 생성 성공:', data.id);
    return data;
  } catch (error) {
    console.error('createChatRoom 오류:', error);
    throw error;
  }
}

/**
 * 사용자별 채팅방 조회
 */
async function getChatRoomsByUser(userId, limit = 10, offset = 0) {
  try {
    const { data, error } = await supabase
      .from('chat_room')
      .select(`
        id,
        title,
        created_at,
        updated_at,
        medical_analysis:medical_analysis_id (
          id,
          model,
          summary,
          document_type,
          created_at
        )
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) {
      console.error('사용자별 채팅방 조회 오류:', error);
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('getChatRoomsByUser 오류:', error);
    throw error;
  }
}

/**
 * 특정 채팅방 조회
 */
async function getChatRoomById(roomId, userId) {
  try {
    const { data, error } = await supabase
      .from('chat_room')
      .select(`
        id,
        title,
        created_at,
        updated_at,
        user_id,
        medical_analysis:medical_analysis_id (
          id,
          model,
          summary,
          result,
          document_type,
          created_at
        )
      `)
      .eq('id', roomId)
      .eq('user_id', userId) // 사용자 권한 검증
      .single();
    
    if (error) {
      console.error('채팅방 조회 오류:', error);
      throw error;
    }
    
    // summary와 result 복호화
    if (data?.medical_analysis?.summary) {
      data.medical_analysis.summary = safeDecrypt(data.medical_analysis.summary);
    }
    if (data?.medical_analysis?.result) {
      data.medical_analysis.result = safeDecrypt(data.medical_analysis.result);
    }
    
    return data;
  } catch (error) {
    console.error('getChatRoomById 오류:', error);
    throw error;
  }
}

/**
 * 채팅방에 의료 분석 연결
 */
async function linkAnalysisToRoom(roomId, analysisId) {
  try {
    const { data, error } = await supabase
      .from('chat_room')
      .update({
        medical_analysis_id: analysisId,
        updated_at: new Date().toISOString()
      })
      .eq('id', roomId)
      .select()
      .single();
    
    if (error) {
      console.error('채팅방에 분석 연결 오류:', error);
      throw error;
    }
    
    console.log('✅ 채팅방에 분석 연결 성공:', roomId, '->', analysisId);
    return data;
  } catch (error) {
    console.error('linkAnalysisToRoom 오류:', error);
    throw error;
  }
}

/**
 * 채팅방 업데이트 (제목 변경, 마지막 활동 시간 업데이트)
 */
async function updateChatRoom(roomId, updates) {
  try {
    const { data, error } = await supabase
      .from('chat_room')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', roomId)
      .select()
      .single();
    
    if (error) {
      console.error('채팅방 업데이트 오류:', error);
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('updateChatRoom 오류:', error);
    throw error;
  }
}

/**
 * 사용자의 채팅방 개수 확인
 */
async function getChatRoomCount(userId) {
  try {
    const { count, error } = await supabase
      .from('chat_room')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    if (error) {
      console.error('채팅방 개수 조회 오류:', error);
      throw error;
    }
    
    return count || 0;
  } catch (error) {
    console.error('getChatRoomCount 오류:', error);
    throw error;
  }
}

/**
 * 사용자의 프리미엄 상태 확인
 * TODO: 실제 사용자 테이블 구조에 맞게 수정 필요
 */
async function checkUserPremiumStatus(userId) {
  try {
    // 임시로 false 반환 (추후 실제 사용자 테이블에서 조회)
    // const { data, error } = await supabase
    //   .from('users')
    //   .select('is_premium')
    //   .eq('id', userId)
    //   .single();
    
    // if (error) {
    //   console.error('사용자 프리미엄 상태 조회 오류:', error);
    //   return false;
    // }
    
    // return data?.is_premium || false;
    
    // 현재는 모든 사용자를 무료 사용자로 간주
    return false;
  } catch (error) {
    console.error('checkUserPremiumStatus 오류:', error);
    return false;
  }
}

/**
 * 채팅방 생성 제한 확인
 */
async function checkChatRoomLimit(userId) {
  try {
    const isPremium = await checkUserPremiumStatus(userId);
    
    // 프리미엄 사용자는 무제한
    if (isPremium) {
      return { canCreate: true, message: '프리미엄 사용자: 무제한 생성 가능' };
    }
    
    // 무료 사용자는 3개 제한
    const currentCount = await getChatRoomCount(userId);
    const FREE_LIMIT = 3;
    
    if (currentCount >= FREE_LIMIT) {
      return { 
        canCreate: false, 
        message: `무료 사용자는 최대 ${FREE_LIMIT}개의 채팅방만 생성할 수 있습니다. 현재 ${currentCount}개 사용 중입니다.`,
        currentCount,
        limit: FREE_LIMIT
      };
    }
    
    return { 
      canCreate: true, 
      message: `채팅방 생성 가능 (${currentCount}/${FREE_LIMIT})`,
      currentCount,
      limit: FREE_LIMIT
    };
  } catch (error) {
    console.error('checkChatRoomLimit 오류:', error);
    return { canCreate: false, message: '채팅방 제한 확인 중 오류가 발생했습니다.' };
  }
}

/**
 * 채팅 히스토리 저장
 */
async function saveChatHistory(userId, roomId, userMessage, aiResponse, model) {
  try {
    // 사용자 메시지와 AI 응답을 암호화
    const encryptedUserMessage = encryptText(userMessage);
    const encryptedAiResponse = encryptText(aiResponse);
    
    const { data, error } = await supabase
      .from('chat_history')
      .insert([{
        user_id: userId,
        room_id: roomId,
        user_message: encryptedUserMessage,
        ai_response: encryptedAiResponse,
        model: model,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) {
      console.error('채팅 히스토리 저장 오류:', error);
      throw error;
    }
    
    console.log('✅ 채팅 히스토리 저장 성공 (암호화됨):', data.id);
    return data;
  } catch (error) {
    console.error('saveChatHistory 오류:', error);
    throw error;
  }
}

/**
 * 채팅 히스토리 조회
 */
async function getChatHistory(userId, roomId, limit = 50, offset = 0) {
  try {
    const { data, error } = await supabase
      .from('chat_history')
      .select('id, user_message, ai_response, model, created_at')
      .eq('user_id', userId)
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .range(offset, offset + limit - 1);
    
    if (error) {
      console.error('채팅 히스토리 조회 오류:', error);
      throw error;
    }
    
    // 메시지들을 복호화하여 반환
    const decryptedData = data.map(chat => ({
      ...chat,
      user_message: safeDecrypt(chat.user_message),
      ai_response: safeDecrypt(chat.ai_response)
    }));
    
    return decryptedData;
  } catch (error) {
    console.error('getChatHistory 오류:', error);
    throw error;
  }
}

/**
 * 최근 채팅 히스토리 조회 (대화 컨텍스트용)
 */
async function getRecentChatHistory(userId, roomId, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('chat_history')
      .select('user_message, ai_response, model, created_at')
      .eq('user_id', userId)
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('최근 채팅 히스토리 조회 오류:', error);
      throw error;
    }
    
    // 메시지들을 복호화하고 시간 순서대로 정렬
    const decryptedData = data.map(chat => ({
      userMessage: safeDecrypt(chat.user_message),
      aiResponse: safeDecrypt(chat.ai_response),
      model: chat.model,
      created_at: chat.created_at
    })).reverse(); // 시간순으로 정렬 (오래된 것부터)
    
    return decryptedData;
  } catch (error) {
    console.error('getRecentChatHistory 오류:', error);
    throw error;
  }
}

/**
 * 분석 결과 테이블 생성 SQL (개발용)
 * 운영 환경에서는 Supabase 대시보드에서 직접 생성하세요.
 */
const CREATE_MEDICAL_ANALYSIS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS medical_analysis (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  room_id TEXT,
  model TEXT NOT NULL,
  summary TEXT NOT NULL,
  result TEXT,
  document_type TEXT DEFAULT 'other',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_medical_analysis_user_id ON medical_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_medical_analysis_created_at ON medical_analysis(created_at);
CREATE INDEX IF NOT EXISTS idx_medical_analysis_document_type ON medical_analysis(document_type);

-- RLS 활성화 (필요한 경우)
-- ALTER TABLE medical_analysis ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 데이터만 볼 수 있는 정책 (필요한 경우)
-- CREATE POLICY "Users can view own analysis results" ON medical_analysis
--   FOR SELECT USING (auth.uid()::text = user_id);
`;

/**
 * 채팅방 테이블 생성 SQL (개발용)
 */
const CREATE_CHAT_ROOM_TABLE_SQL = `
-- UUID 확장 모듈 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS chat_room (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  medical_analysis_id BIGINT REFERENCES medical_analysis(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '새로운 의료 분석',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_chat_room_user_id ON chat_room(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_room_created_at ON chat_room(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_room_medical_analysis_id ON chat_room(medical_analysis_id);

-- RLS 활성화 (필요한 경우)
-- ALTER TABLE chat_room ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 채팅방만 볼 수 있는 정책 (필요한 경우)
-- CREATE POLICY "Users can view own chat rooms" ON chat_room
--   FOR ALL USING (auth.uid()::text = user_id);
`;

/**
 * 채팅 히스토리 테이블 생성 SQL (개발용)
 */
const CREATE_CHAT_HISTORY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS chat_history (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  room_id UUID NOT NULL REFERENCES chat_room(id) ON DELETE CASCADE,
  user_message TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_room_id ON chat_history(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at);

-- RLS 활성화 (필요한 경우)
-- ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 채팅 히스토리만 볼 수 있는 정책 (필요한 경우)
-- CREATE POLICY "Users can view own chat history" ON chat_history
--   FOR ALL USING (auth.uid()::text = user_id);
`;

module.exports = {
  supabase,
  testConnection,
  checkRLSStatus,
  createUserDev,
  saveAnalysisResult,
  getAnalysisResultsByUser,
  createChatRoom,
  getChatRoomsByUser,
  getChatRoomById,
  linkAnalysisToRoom,
  updateChatRoom,
  getChatRoomCount,
  checkUserPremiumStatus,
  checkChatRoomLimit,
  saveChatHistory,
  getChatHistory,
  getRecentChatHistory,
  CREATE_MEDICAL_ANALYSIS_TABLE_SQL,
  CREATE_CHAT_ROOM_TABLE_SQL,
  CREATE_CHAT_HISTORY_TABLE_SQL,
  isDevelopment
}; 