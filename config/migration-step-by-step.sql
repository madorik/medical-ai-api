-- =================================
-- 의료 AI API 데이터베이스 마이그레이션
-- 단계별 실행용 스크립트
-- =================================

-- STEP 1: 사용자 테이블 컬럼 추가
-- 다음 명령어들을 하나씩 실행하세요

-- 1-1. provider 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'google';

-- 1-2. provider_id 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255);

-- 1-3. profile_image 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image TEXT;

-- STEP 2: 기존 데이터 마이그레이션
UPDATE users 
SET provider_id = google_id, 
    provider = 'google',
    profile_image = picture_url
WHERE google_id IS NOT NULL AND provider_id IS NULL;

-- STEP 3: 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider_id ON users(provider, provider_id);

-- STEP 4: Unique Constraint 추가 (수동으로 확인 후 실행)
-- 먼저 기존 constraint 확인
SELECT conname FROM pg_constraint WHERE conname = 'unique_provider_id' AND conrelid = 'users'::regclass;

-- 결과가 없으면 다음 명령어 실행
-- ALTER TABLE users ADD CONSTRAINT unique_provider_id UNIQUE (provider, provider_id);

-- STEP 5: 채팅 히스토리 테이블 생성/수정
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

-- STEP 6: 채팅 히스토리 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_created ON chat_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_history_emergency ON chat_history(user_id, is_emergency) WHERE is_emergency = TRUE;

-- STEP 7: 통계용 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_chat_history_date ON chat_history(DATE(created_at));
CREATE INDEX IF NOT EXISTS idx_chat_history_week ON chat_history(DATE_TRUNC('week', created_at));
CREATE INDEX IF NOT EXISTS idx_chat_history_month ON chat_history(DATE_TRUNC('month', created_at));

-- STEP 8: RLS 활성화
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

-- STEP 9: RLS 정책 생성
CREATE POLICY IF NOT EXISTS "Users can view own chat history" ON chat_history
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert own chat history" ON chat_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own chat history" ON chat_history
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own chat history" ON chat_history
  FOR DELETE USING (auth.uid() = user_id);

-- STEP 10: 업데이트 함수 생성
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- STEP 11: 트리거 생성
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_chat_history_updated_at ON chat_history;
CREATE TRIGGER update_chat_history_updated_at 
  BEFORE UPDATE ON chat_history 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- STEP 12: 통계 뷰 생성
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

-- STEP 13: 데이터 정합성 확인
SELECT 
  COUNT(*) as total_users,
  COUNT(CASE WHEN provider = 'google' THEN 1 END) as google_users,
  COUNT(CASE WHEN provider_id IS NOT NULL THEN 1 END) as migrated_users,
  COUNT(CASE WHEN google_id IS NOT NULL AND provider_id IS NULL THEN 1 END) as pending_migration
FROM users;

-- ========================================
-- 선택사항: 응급 로그 테이블 (나중에 실행)
-- ========================================

-- CREATE TABLE IF NOT EXISTS emergency_logs (
--   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
--   user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   chat_id UUID NOT NULL REFERENCES chat_history(id) ON DELETE CASCADE,
--   emergency_keywords TEXT[],
--   user_message TEXT NOT NULL,
--   ai_response TEXT NOT NULL,
--   resolved BOOLEAN DEFAULT FALSE,
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
-- );

-- CREATE INDEX IF NOT EXISTS idx_emergency_logs_user_id ON emergency_logs(user_id);
-- CREATE INDEX IF NOT EXISTS idx_emergency_logs_created_at ON emergency_logs(created_at DESC);
-- CREATE INDEX IF NOT EXISTS idx_emergency_logs_resolved ON emergency_logs(resolved) WHERE resolved = FALSE; 