-- 의료 문서 카테고리 지원을 위한 데이터베이스 마이그레이션
-- 실행 전 백업 권장

BEGIN;

-- medical_records 테이블에 카테고리 관련 컬럼 추가
ALTER TABLE medical_records 
ADD COLUMN IF NOT EXISTS document_category VARCHAR(50) DEFAULT 'other',
ADD COLUMN IF NOT EXISTS category_confidence VARCHAR(10) DEFAULT 'low',
ADD COLUMN IF NOT EXISTS classification_method VARCHAR(20) DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS category_metadata JSONB DEFAULT '{}';

-- 카테고리 컬럼에 인덱스 추가 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_medical_records_category ON medical_records(document_category);
CREATE INDEX IF NOT EXISTS idx_medical_records_category_confidence ON medical_records(category_confidence);

-- 기존 데이터에 대한 기본 카테고리 설정 (필요시)
UPDATE medical_records 
SET document_category = 'medical_record'
WHERE document_category IS NULL OR document_category = '';

-- 카테고리별 통계를 위한 뷰 생성
CREATE OR REPLACE VIEW medical_category_stats AS
SELECT 
  user_id,
  document_category,
  COUNT(*) as record_count,
  MAX(created_at) as latest_date,
  MIN(created_at) as first_date,
  AVG(CASE WHEN category_confidence = 'high' THEN 3 
           WHEN category_confidence = 'medium' THEN 2 
           ELSE 1 END) as avg_confidence_score
FROM medical_records
GROUP BY user_id, document_category;

-- 카테고리별 월간 통계를 위한 뷰 생성
CREATE OR REPLACE VIEW medical_category_monthly_stats AS
SELECT 
  user_id,
  document_category,
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as monthly_count
FROM medical_records
GROUP BY user_id, document_category, DATE_TRUNC('month', created_at)
ORDER BY month DESC;

COMMIT;

-- 마이그레이션 성공 확인을 위한 샘플 쿼리들
-- (실제 실행은 하지 않고 참고용)

/*
-- 카테고리별 레코드 수 확인
SELECT document_category, COUNT(*) as count
FROM medical_records
GROUP BY document_category
ORDER BY count DESC;

-- 사용자별 카테고리 통계 확인  
SELECT * FROM medical_category_stats
WHERE user_id = 'your-user-id'
ORDER BY record_count DESC;

-- 월간 카테고리 트렌드 확인
SELECT * FROM medical_category_monthly_stats
WHERE user_id = 'your-user-id'
  AND month >= DATE_TRUNC('month', NOW() - INTERVAL '6 months')
ORDER BY month DESC, monthly_count DESC;
*/ 