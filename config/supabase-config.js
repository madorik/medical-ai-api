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
  console.log('🔓 개발 모드: RLS 우회 활성화 (service_role 키 사용)');
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

module.exports = {
  supabase,
  testConnection,
  checkRLSStatus,
  createUserDev,
  isDevelopment
}; 