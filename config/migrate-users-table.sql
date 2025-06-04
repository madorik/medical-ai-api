-- 사용자 테이블에 새로운 컬럼 추가 (provider 지원을 위해)
-- 기존 google_id를 provider_id로 마이그레이션

-- 1. 새로운 컬럼 추가
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'google',
ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS profile_image TEXT;

-- 2. 기존 google_id 데이터를 provider_id로 마이그레이션
UPDATE users 
SET provider_id = google_id, 
    provider = 'google',
    profile_image = picture_url
WHERE google_id IS NOT NULL AND provider_id IS NULL;

-- 3. 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_users_provider_id ON users(provider, provider_id);

-- 4. unique constraint 추가 (존재하지 않을 경우에만)
DO $$
BEGIN
    -- unique constraint가 존재하지 않는 경우에만 추가
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_provider_id' 
        AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users 
        ADD CONSTRAINT unique_provider_id 
        UNIQUE (provider, provider_id);
    END IF;
END $$;

-- 5. 데이터 정합성 확인 쿼리 (실행 후 결과 확인용)
SELECT 
  COUNT(*) as total_users,
  COUNT(CASE WHEN provider = 'google' THEN 1 END) as google_users,
  COUNT(CASE WHEN provider_id IS NOT NULL THEN 1 END) as migrated_users,
  COUNT(CASE WHEN google_id IS NOT NULL AND provider_id IS NULL THEN 1 END) as pending_migration
FROM users;

-- 주의사항:
-- 1. 이 스크립트는 Supabase SQL Editor에서 실행해야 합니다
-- 2. 실행 전 데이터 백업을 권장합니다
-- 3. 마이그레이션 후 google_id 컬럼은 당분간 유지하되, 나중에 제거할 수 있습니다

-- 선택사항: google_id 컬럼 제거 (충분한 테스트 후)
-- ALTER TABLE users DROP COLUMN IF EXISTS google_id;
-- ALTER TABLE users DROP COLUMN IF EXISTS picture_url; 