const { createClient } = require('@supabase/supabase-js');

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
    const { data, error } = await supabase
      .from('medical_analysis')
      .insert([{
        user_id: analysisData.userId,
        room_id: analysisData.roomId || null,
        model: analysisData.model,
        summary: analysisData.summary,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) {
      console.error('의료 분석 결과 저장 오류:', error);
      throw error;
    }
    
    console.log('✅ 의료 분석 결과 저장 성공:', data.id);
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
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) {
      console.error('사용자별 분석 결과 조회 오류:', error);
      throw error;
    }
    
    return data;
  } catch (error) {
    console.error('getAnalysisResultsByUser 오류:', error);
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_medical_analysis_user_id ON medical_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_medical_analysis_created_at ON medical_analysis(created_at);

-- RLS 활성화 (필요한 경우)
-- ALTER TABLE medical_analysis ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 데이터만 볼 수 있는 정책 (필요한 경우)
-- CREATE POLICY "Users can view own analysis results" ON medical_analysis
--   FOR SELECT USING (auth.uid()::text = user_id);
`;

module.exports = {
  supabase,
  testConnection,
  checkRLSStatus,
  createUserDev,
  saveAnalysisResult,
  getAnalysisResultsByUser,
  CREATE_MEDICAL_ANALYSIS_TABLE_SQL,
  isDevelopment
}; 