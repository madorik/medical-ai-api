# 데이터베이스 최적화 제안

## 현재 문제점
- `medical_records` 테이블의 `ai_analysis`와 `summary` 필드에 중복/유사 데이터 저장됨
- 불필요한 OpenAI API 호출로 비용 증가

## 해결 방안

### 방안 1: Summary 필드 제거 (권장)
```sql
-- summary 컬럼 삭제
ALTER TABLE medical_records DROP COLUMN summary;
```

**장점:**
- 중복 데이터 제거
- API 호출 비용 절약
- 코드 단순화

**프론트엔드 적용:**
```javascript
// 기존: record.summary 사용
// 변경: record.ai_analysis.substring(0, 200) + '...' 사용
const preview = record.ai_analysis?.substring(0, 200) + '...' || '분석 결과가 없습니다.';
```

### 방안 2: Summary를 실제 요약으로 개선 (현재 적용됨)
```javascript
// 별도 요약 생성
const summaryStream = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    {
      role: 'user',
      content: `다음 의료 분석 결과를 3-4줄로 핵심만 요약해주세요:\n\n${analysisResult}`
    }
  ],
  stream: false,
  max_tokens: 3000,
  temperature: 0.3
});
```

**장점:**
- 실제 의미 있는 요약 제공
- 사용자가 한눈에 파악 가능

**단점:**
- 추가 API 호출 비용
- 처리 시간 증가

### 방안 3: 클라이언트 사이드 요약
```javascript
// 프론트엔드에서 처리
const generateSummary = (analysisText) => {
  const sentences = analysisText.split(/[.!?]+/).filter(s => s.trim().length > 10);
  return sentences.slice(0, 3).join('. ') + '.';
};
```

## 권장사항

**즉시 적용:** 방안 1 (Summary 필드 제거)
- 가장 간단하고 효율적
- 중복 제거로 데이터 일관성 향상
- 비용 절약

**향후 고려:** 방안 3 (클라이언트 사이드 요약)
- 필요시 프론트엔드에서 동적 생성
- 서버 부하 없음 