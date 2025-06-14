-- 진료 기록 및 채팅방 시스템 마이그레이션
-- 실행 전 백업 권장

BEGIN;

-- 채팅방 테이블 생성
CREATE TABLE IF NOT EXISTS chat_rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 채팅방 인덱스
CREATE INDEX IF NOT EXISTS idx_chat_rooms_user_id ON chat_rooms(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_created_at ON chat_rooms(created_at DESC);

-- 진료 기록 테이블 생성
CREATE TABLE IF NOT EXISTS medical_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_room_id UUID REFERENCES chat_rooms(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255),
  file_content TEXT NOT NULL,
  file_type VARCHAR(50),
  extracted_info JSONB,
  summary TEXT,
  ai_analysis TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 진료 기록 인덱스
CREATE INDEX IF NOT EXISTS idx_medical_records_user_id ON medical_records(user_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_chat_room_id ON medical_records(chat_room_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_created_at ON medical_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_medical_records_file_type ON medical_records(file_type);

-- 채팅 메시지 테이블 생성
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_type VARCHAR(20) NOT NULL CHECK (message_type IN ('user', 'assistant')),
  content TEXT NOT NULL,
  is_emergency BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 채팅 메시지 인덱스
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON chat_messages(chat_room_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created ON chat_messages(chat_room_id, created_at ASC);

-- Row Level Security 활성화
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- 채팅방 RLS 정책
DROP POLICY IF EXISTS "Users can view own chat rooms" ON chat_rooms;
CREATE POLICY "Users can view own chat rooms" ON chat_rooms
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own chat rooms" ON chat_rooms;
CREATE POLICY "Users can insert own chat rooms" ON chat_rooms
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own chat rooms" ON chat_rooms;
CREATE POLICY "Users can update own chat rooms" ON chat_rooms
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own chat rooms" ON chat_rooms;
CREATE POLICY "Users can delete own chat rooms" ON chat_rooms
  FOR DELETE USING (auth.uid() = user_id);

-- 진료 기록 RLS 정책
DROP POLICY IF EXISTS "Users can view own medical records" ON medical_records;
CREATE POLICY "Users can view own medical records" ON medical_records
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own medical records" ON medical_records;
CREATE POLICY "Users can insert own medical records" ON medical_records
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own medical records" ON medical_records;
CREATE POLICY "Users can update own medical records" ON medical_records
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own medical records" ON medical_records;
CREATE POLICY "Users can delete own medical records" ON medical_records
  FOR DELETE USING (auth.uid() = user_id);

-- 채팅 메시지 RLS 정책
DROP POLICY IF EXISTS "Users can view own chat messages" ON chat_messages;
CREATE POLICY "Users can view own chat messages" ON chat_messages
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own chat messages" ON chat_messages;
CREATE POLICY "Users can insert own chat messages" ON chat_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 업데이트 트리거 추가
DROP TRIGGER IF EXISTS update_chat_rooms_updated_at ON chat_rooms;
CREATE TRIGGER update_chat_rooms_updated_at 
  BEFORE UPDATE ON chat_rooms 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_medical_records_updated_at ON medical_records;
CREATE TRIGGER update_medical_records_updated_at 
  BEFORE UPDATE ON medical_records 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 통계 뷰 업데이트
CREATE OR REPLACE VIEW medical_statistics AS
SELECT 
  u.id as user_id,
  COUNT(DISTINCT mr.id) as total_records,
  COUNT(DISTINCT cr.id) as total_chat_rooms,
  COUNT(DISTINCT cm.id) as total_messages,
  COUNT(CASE WHEN DATE(mr.created_at) = CURRENT_DATE THEN 1 END) as today_records,
  COUNT(CASE WHEN DATE(cr.created_at) = CURRENT_DATE THEN 1 END) as today_chat_rooms,
  MIN(mr.created_at) as first_record_date,
  MAX(mr.created_at) as last_record_date
FROM users u
LEFT JOIN medical_records mr ON u.id = mr.user_id
LEFT JOIN chat_rooms cr ON u.id = cr.user_id
LEFT JOIN chat_messages cm ON u.id = cm.user_id
GROUP BY u.id;

COMMIT;

-- 마이그레이션 완료 알림
DO $$
BEGIN
  RAISE NOTICE '✅ 진료 기록 및 채팅방 테이블 마이그레이션이 완료되었습니다.';
  RAISE NOTICE '📋 생성된 테이블: chat_rooms, medical_records, chat_messages';
  RAISE NOTICE '🔒 Row Level Security가 모든 테이블에 적용되었습니다.';
  RAISE NOTICE '📊 medical_statistics 뷰가 생성되었습니다.';
END $$; 