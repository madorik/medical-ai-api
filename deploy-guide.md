# 🚀 Vercel 배포 가이드

## 1. Vercel 로그인 확인
```bash
vercel whoami
```

## 2. 프로젝트 배포
```bash
vercel --prod
```

## 3. 환경변수 설정 (Vercel 대시보드에서)
다음 환경변수들을 Vercel 프로젝트 설정에서 추가하세요:

- `OPENAI_API_KEY`: OpenAI API 키
- `GOOGLE_CLIENT_ID`: Google OAuth 클라이언트 ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth 클라이언트 시크릿
- `SUPABASE_URL`: Supabase 프로젝트 URL
- `SUPABASE_ANON_KEY`: Supabase Anonymous 키
- `SESSION_SECRET`: 세션 암호화 키 (랜덤 문자열)
- `NODE_ENV`: `production`

## 4. 도메인 설정
1. Vercel 대시보드에서 프로젝트 선택
2. Settings > Domains에서 커스텀 도메인 추가 (선택사항)
3. server.js의 CORS 설정에서 실제 도메인으로 업데이트

## 5. Google OAuth 리디렉션 URL 설정
Google Cloud Console에서 다음 URL을 승인된 리디렉션 URI에 추가:
```
https://your-app-name.vercel.app/auth/google/callback
```

## 6. 배포 완료 후 테스트
1. 메인 페이지: `https://your-app-name.vercel.app`
2. 데모 페이지: `https://your-app-name.vercel.app/public/medical-analysis-demo.html`
3. API 문서: `https://your-app-name.vercel.app`

## 배포 명령어 요약
```bash
# 처음 배포
vercel --prod

# 재배포 (코드 변경 후)
vercel --prod

# 배포 상태 확인
vercel ls

# 로그 확인
vercel logs
```

## 문제 해결
- 환경변수가 제대로 설정되지 않으면 Vercel 대시보드에서 확인
- Function timeout: vercel.json에서 maxDuration 조정
- CORS 오류: server.js의 origin 설정 확인 