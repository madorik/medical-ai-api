# 🏥 Medical AI API

OpenAI와 Google OAuth를 활용한 의료 진료 기록 분석 및 상담 채팅 API

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

### 💬 AI 의료 상담 채팅
- **개인화된 상담**: 사용자의 의료 분석 기록을 바탕으로 한 맞춤형 상담
- **실시간 채팅**: 사용자와 의료 AI 간 실시간 대화
- **스트리밍 응답**: SSE를 통한 AI 응답 실시간 스트리밍
- **채팅 히스토리**: 대화 내용 자동 저장 및 조회
- **의료 전문 프롬프트**: 의료 상담에 특화된 AI 어시스턴트
- **분석 기록 연동**: 이전 의료 문서 분석 결과를 참고한 상담

## 🚀 API 엔드포인트

### 인증 관련
- `GET /auth/google` - Google OAuth 로그인
- `GET /auth/status` - 로그인 상태 확인
- `GET /auth/profile` - 사용자 프로필 조회
- `POST /auth/verify-token` - JWT 토큰 검증
- `POST /auth/logout` - 로그아웃

### 진료 기록 분석
- `POST /api/medical/analyze` - 진료 기록 업로드 및 분석 (SSE) **🔐 인증 필수**
- `GET /api/medical/analysis-history` - 사용자별 분석 결과 조회 **🔐 인증 필수**
- `GET /api/medical/supported-formats` - 지원 파일 형식 조회

### 의료 상담 채팅
- `POST /chat/stream` - 개인화된 실시간 채팅 (SSE 스트리밍) **🔐 인증 필수**
- `POST /chat/message` - 일반 채팅 (단일 응답)
- `GET /chat/history` - 채팅 히스토리 조회
- `DELETE /chat/history` - 채팅 히스토리 삭제

### 데모 페이지
- `/public/medical-analysis-demo.html` - 진료 기록 분석 테스트 페이지
- `/public/medical-chat-demo.html` - 의료 상담 채팅 데모 페이지

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
- ✅ **개인화 상담**: 사용자의 의료 분석 기록을 바탕으로 한 맞춤형 AI 상담
- ✅ **인증 기반**: JWT 토큰을 통한 사용자별 데이터 보안 관리
- ✅ **분석 기록 저장**: Supabase에 사용자별 분석 결과 자동 저장

## 💡 개인화 채팅 기능

### 작동 방식
1. **사용자 인증**: JWT 토큰을 통해 사용자 신원 확인
2. **의료 기록 조회**: 해당 사용자의 최근 분석 결과 5개 조회
3. **개인화 프롬프트**: 의료 기록을 시스템 프롬프트에 포함
4. **맞춤형 상담**: AI가 이전 분석 결과를 참고하여 답변

### 개인화 정보 활용
- 이전 진단 결과와 연관지은 조언
- 처방된 약물과 관련된 질문 대응
- 검사 수치 변화 추적 및 상담
- 개인 의료 히스토리 기반 위험 요소 분석

### 사용 예시
```javascript
// 인증 토큰과 함께 채팅 요청
fetch('/chat/stream', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message: '최근 혈압약을 복용하고 있는데 부작용이 있을까요?',
    chatHistory: []
  })
});

// AI 응답: "이전 분석 결과를 보니 고혈압 진단을 받으셨고 
// 암로디핀을 처방받으셨네요. 이 약물의 주요 부작용은..."
```
- ✅ **다중 파일 형식 지원**: 이미지와 PDF 모두 처리 가능
- ✅ **에러 처리**: 상세한 에러 메시지와 사용자 친화적 응답

## 🚨 주의사항

- OpenAI API 키가 필요합니다
- 의료 정보 처리 시 개인정보보호 법규를 준수해야 합니다
- 분석 결과는 참고용이며 의료진의 진단을 대체할 수 없습니다

## 📞 문의

프로젝트에 대한 문의사항이 있으시면 Issues를 통해 연락주세요. 