-- 사용자 테이블 (이미 존재하는 경우 건너뛰기)
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  picture_url TEXT,
  google_id VARCHAR(255) UNIQUE,
  provider VARCHAR(50) DEFAULT 'google',
  provider_id VARCHAR(255),
  profile_image TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 사용자 테이블 인덱스
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider_id ON users(provider, provider_id);

-- 채팅 히스토리 테이블
CREATE TABLE IF NOT EXISTS chat_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_message TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  is_emergency BOOLEAN DEFAULT FALSE,
  message_length INTEGER GENERATED ALWAYS AS (LENGTH(user_message)) STORED,
  response_length INTEGER GENERATED ALWAYS AS (LENGTH(ai_response)) STORED,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 채팅 히스토리 인덱스 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_created ON chat_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_history_emergency ON chat_history(user_id, is_emergency) WHERE is_emergency = TRUE;

-- 채팅 통계를 위한 함수 기반 인덱스
CREATE INDEX IF NOT EXISTS idx_chat_history_date ON chat_history(DATE(created_at));
CREATE INDEX IF NOT EXISTS idx_chat_history_week ON chat_history(DATE_TRUNC('week', created_at));
CREATE INDEX IF NOT EXISTS idx_chat_history_month ON chat_history(DATE_TRUNC('month', created_at));

-- Row Level Security 활성화
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- 채팅 히스토리 RLS 정책: 사용자는 자신의 채팅만 조회/수정 가능
CREATE POLICY IF NOT EXISTS "Users can view own chat history" ON chat_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert own chat history" ON chat_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own chat history" ON chat_history
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own chat history" ON chat_history
  FOR DELETE USING (auth.uid() = user_id);

-- 업데이트 시간 자동 갱신 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 업데이트 트리거 추가
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_chat_history_updated_at ON chat_history;
CREATE TRIGGER update_chat_history_updated_at 
  BEFORE UPDATE ON chat_history 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 채팅 통계를 위한 뷰 생성 (성능 최적화)
CREATE OR REPLACE VIEW chat_statistics AS
SELECT 
  user_id,
  COUNT(*) as total_messages,
  COUNT(CASE WHEN DATE(created_at) = CURRENT_DATE THEN 1 END) as today_messages,
  COUNT(CASE WHEN created_at >= DATE_TRUNC('week', NOW()) THEN 1 END) as week_messages,
  COUNT(CASE WHEN created_at >= DATE_TRUNC('month', NOW()) THEN 1 END) as month_messages,
  COUNT(CASE WHEN is_emergency = TRUE THEN 1 END) as emergency_messages,
  AVG(message_length) as avg_message_length,
  AVG(response_length) as avg_response_length,
  MIN(created_at) as first_message_date,
  MAX(created_at) as last_message_date
FROM chat_history 
GROUP BY user_id;

-- 응급 상황 로그 테이블 (선택사항)
CREATE TABLE IF NOT EXISTS emergency_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL REFERENCES chat_history(id) ON DELETE CASCADE,
  emergency_keywords TEXT[],
  user_message TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 응급 로그 인덱스
CREATE INDEX IF NOT EXISTS idx_emergency_logs_user_id ON emergency_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_logs_created_at ON emergency_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_emergency_logs_resolved ON emergency_logs(resolved) WHERE resolved = FALSE;

-- 채팅 세션 관리 (선택사항 - 향후 확장을 위한)
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_name VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 세션 인덱스
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_active ON chat_sessions(user_id, is_active) WHERE is_active = TRUE;

-- 데이터 정리를 위한 파티션 (90일 이후 자동 아카이브)
-- CREATE TABLE chat_history_archive (LIKE chat_history INCLUDING ALL);

-- 성능 모니터링을 위한 함수들
CREATE OR REPLACE FUNCTION get_user_chat_stats(p_user_id UUID)
RETURNS TABLE (
  total_messages BIGINT,
  today_messages BIGINT,
  week_messages BIGINT,
  month_messages BIGINT,
  emergency_count BIGINT,
  avg_msg_length NUMERIC,
  first_chat TIMESTAMP WITH TIME ZONE,
  last_chat TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_messages,
    COUNT(CASE WHEN DATE(ch.created_at) = CURRENT_DATE THEN 1 END) as today_messages,
    COUNT(CASE WHEN ch.created_at >= DATE_TRUNC('week', NOW()) THEN 1 END) as week_messages,
    COUNT(CASE WHEN ch.created_at >= DATE_TRUNC('month', NOW()) THEN 1 END) as month_messages,
    COUNT(CASE WHEN ch.is_emergency = TRUE THEN 1 END) as emergency_count,
    AVG(ch.message_length)::NUMERIC as avg_msg_length,
    MIN(ch.created_at) as first_chat,
    MAX(ch.created_at) as last_chat
  FROM chat_history ch 
  WHERE ch.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 주석: 실제 운영 환경에서는 다음과 같은 추가 설정을 고려하세요
-- 1. 테이블 파티셔닝 (대용량 데이터 처리)
-- 2. 정기적인 VACUUM 및 ANALYZE 스케줄링
-- 3. 백업 및 복구 전략
-- 4. 모니터링 및 알림 설정 