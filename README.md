# 🏥 Medical AI API

OpenAI와 Google OAuth를 활용한 의료 진료 기록 분석 API

## 🌟 주요 기능

### 🔐 인증 시스템
- Google OAuth 2.0 소셜 로그인
- JWT 토큰 기반 인증
- 세션 관리

### 🤖 AI 진료 기록 분석 
- **파일 업로드**: JPG, PNG, PDF (최대 5MB)
- **진료 기록 자동 검증**: AI가 업로드된 파일이 진료 기록인지 자동 확인
- **실시간 스트리밍 분석**: SSE(Server-Sent Events)를 통한 실시간 분석 결과 전송
- **구조화된 JSON 응답**: 환자 정보, 진단명, 처방전, 검사 결과 등을 체계적으로 분석

## 🚀 API 엔드포인트

### 인증 관련
- `GET /auth/google` - Google OAuth 로그인
- `GET /auth/status` - 로그인 상태 확인
- `GET /auth/profile` - 사용자 프로필 조회
- `POST /auth/verify-token` - JWT 토큰 검증
- `POST /auth/logout` - 로그아웃

### 진료 기록 분석
- `POST /api/medical/analyze` - 진료 기록 업로드 및 분석 (SSE)
- `GET /api/medical/supported-formats` - 지원 파일 형식 조회

### 데모 페이지
- `/public/medical-analysis-demo.html` - 진료 기록 분석 테스트 페이지

## 📊 분석 결과 형식

```json
{
  "patientInfo": {
    "name": "환자명",
    "age": "나이", 
    "gender": "성별",
    "patientId": "환자번호"
  },
  "medicalInfo": {
    "diagnosis": "진단명",
    "symptoms": ["증상1", "증상2"],
    "prescriptions": [
      {
        "medicationName": "약물명",
        "dosage": "용량",
        "frequency": "복용빈도", 
        "duration": "복용기간"
      }
    ],
    "testResults": [
      {
        "testName": "검사명",
        "result": "결과값",
        "normalRange": "정상범위",
        "unit": "단위"
      }
    ],
    "visitDate": "진료일자",
    "department": "진료과",
    "hospitalName": "병원명"
  },
  "summary": "진료 기록 요약",
  "recommendations": ["권장사항1", "권장사항2"],
  "riskFactors": ["위험요소1", "위험요소2"],
  "followUpRequired": true
}
```

## 🛠️ 기술 스택

- **Backend**: Node.js, Express.js
- **AI**: OpenAI GPT-4o-mini (텍스트 + 이미지 분석)
- **인증**: Google OAuth 2.0, JWT
- **데이터베이스**: Supabase PostgreSQL
- **파일 처리**: Multer, PDF-Parse
- **실시간 통신**: Server-Sent Events (SSE)

## 🔧 설치 및 실행

1. **의존성 설치**
```bash
npm install
```

2. **환경변수 설정** (`.env` 파일 생성)
```env
OPENAI_API_KEY=your_openai_api_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SESSION_SECRET=your_session_secret
PORT=3000
NODE_ENV=development
```

3. **서버 실행**
```bash
# 개발 모드
npm run dev

# 프로덕션 모드  
npm start
```

## 🌐 Vercel 배포

### 배포 명령어
```bash
# Vercel CLI 설치
npm install -g vercel

# Vercel 로그인
vercel login

# 프로덕션 배포
vercel --prod
```

### 환경변수 설정
Vercel 대시보드에서 다음 환경변수들을 설정하세요:
- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID` 
- `GOOGLE_CLIENT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SESSION_SECRET`
- `NODE_ENV=production`

자세한 배포 가이드는 `deploy-guide.md` 파일을 참고하세요.

## 📱 사용 방법

### 1. 웹 데모 사용
1. 브라우저에서 `http://localhost:3000/public/medical-analysis-demo.html` 접속
2. 진료 기록 파일 (JPG, PNG, PDF) 업로드
3. 실시간으로 분석 결과 확인

### 2. API 직접 호출
```javascript
// FormData 생성
const formData = new FormData();
formData.append('medicalFile', file);

// SSE 연결로 실시간 분석
const response = await fetch('/api/medical/analyze', {
  method: 'POST',
  body: formData
});

// 스트리밍 응답 처리
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  // SSE 데이터 파싱 및 처리
}
```

## 🔒 보안 기능

- **파일 검증**: 파일 크기, 형식, 확장자 검증
- **Rate Limiting**: API 호출 빈도 제한 (15분당 100회)
- **CORS 설정**: 허용된 도메인만 접근 가능
- **Helmet**: 보안 헤더 자동 설정
- **JWT 토큰**: 인증 토큰 검증

## 📋 지원 파일 형식

- **이미지**: JPG, PNG (최대 5MB)
- **문서**: PDF (최대 5MB)
- **진료 기록**: 처방전, 진단서, 검사 결과지, 의무 기록 등

## 🎯 주요 특징

- ✅ **실시간 스트리밍**: SSE로 분석 과정을 실시간 확인
- ✅ **자동 검증**: 업로드된 파일이 진료 기록인지 자동 판별
- ✅ **구조화된 분석**: JSON 형태로 체계적인 분석 결과 제공
- ✅ **다중 파일 형식 지원**: 이미지와 PDF 모두 처리 가능
- ✅ **에러 처리**: 상세한 에러 메시지와 사용자 친화적 응답

## 🚨 주의사항

- OpenAI API 키가 필요합니다
- 의료 정보 처리 시 개인정보보호 법규를 준수해야 합니다
- 분석 결과는 참고용이며 의료진의 진단을 대체할 수 없습니다

## 📞 문의

프로젝트에 대한 문의사항이 있으시면 Issues를 통해 연락주세요. 