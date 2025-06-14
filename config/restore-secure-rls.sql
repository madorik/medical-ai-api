-- 보안 RLS 정책 복원
-- 테스트 완료 후 실행하여 보안을 강화합니다

BEGIN;

-- 기존 임시 정책 삭제
DROP POLICY IF EXISTS "Enable all for chat_rooms" ON chat_rooms;
DROP POLICY IF EXISTS "Enable all for medical_records" ON medical_records;
DROP POLICY IF EXISTS "Enable all for chat_messages" ON chat_messages;

-- 사용자별 접근 제한 정책 재생성
-- 채팅방 정책
CREATE POLICY "Users can view own chat rooms" ON chat_rooms
  FOR SELECT USING (user_id::text = auth.jwt() ->> 'sub' OR user_id = auth.uid());

CREATE POLICY "Users can insert own chat rooms" ON chat_rooms
  FOR INSERT WITH CHECK (user_id::text = auth.jwt() ->> 'sub' OR user_id = auth.uid());

CREATE POLICY "Users can update own chat rooms" ON chat_rooms
  FOR UPDATE USING (user_id::text = auth.jwt() ->> 'sub' OR user_id = auth.uid());

CREATE POLICY "Users can delete own chat rooms" ON chat_rooms
  FOR DELETE USING (user_id::text = auth.jwt() ->> 'sub' OR user_id = auth.uid());

-- 진료 기록 정책
CREATE POLICY "Users can view own medical records" ON medical_records
  FOR SELECT USING (user_id::text = auth.jwt() ->> 'sub' OR user_id = auth.uid());

CREATE POLICY "Users can insert own medical records" ON medical_records
  FOR INSERT WITH CHECK (user_id::text = auth.jwt() ->> 'sub' OR user_id = auth.uid());

CREATE POLICY "Users can update own medical records" ON medical_records
  FOR UPDATE USING (user_id::text = auth.jwt() ->> 'sub' OR user_id = auth.uid());

CREATE POLICY "Users can delete own medical records" ON medical_records
  FOR DELETE USING (user_id::text = auth.jwt() ->> 'sub' OR user_id = auth.uid());

-- 채팅 메시지 정책
CREATE POLICY "Users can view own chat messages" ON chat_messages
  FOR SELECT USING (user_id::text = auth.jwt() ->> 'sub' OR user_id = auth.uid());

CREATE POLICY "Users can insert own chat messages" ON chat_messages
  FOR INSERT WITH CHECK (user_id::text = auth.jwt() ->> 'sub' OR user_id = auth.uid());

COMMIT;

-- 확인 메시지
DO $$
BEGIN
  RAISE NOTICE '✅ 보안 RLS 정책이 복원되었습니다.';
  RAISE NOTICE '🔒 사용자별 데이터 접근 제한이 활성화되었습니다.';
END $$; 