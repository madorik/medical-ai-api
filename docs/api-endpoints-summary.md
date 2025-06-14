# API 엔드포인트 요약

## 핵심 플로우
```
POST /medical/upload → roomId 받음 → GET /medical/chat-rooms/{roomId} → POST /rooms/chat-rooms/{roomId}/stream
```

## 전체 API 목록

| 엔드포인트 | 메서드 | 기능 | 중요도 | 비고 |
|------------|--------|------|--------|------|
| `/medical/upload` | POST | **파일 업로드 + 채팅방 생성** | 🔥 핵심 | multipart/form-data |
| `/medical/chat-rooms` | GET | 채팅방 목록 조회 | ⭐ 필수 | |
| `/medical/chat-rooms/{roomId}` | GET | **채팅방 상세 + 메시지 히스토리** | ⭐ 필수 | |
| `/rooms/chat-rooms/{roomId}/stream` | POST | **실시간 AI 채팅** | 🔥 핵심 | Server-Sent Events |
| `/rooms/chat-rooms/{roomId}/message` | POST | 일반 메시지 전송 | 📝 선택 | 스트리밍 안됨 |
| `/medical/chat-rooms/{roomId}` | DELETE | 채팅방 삭제 | 📝 선택 | |
| `/medical/records` | GET | 진료 기록 목록 | 📝 선택 | |
| `/medical/records/{recordId}` | DELETE | 진료 기록 삭제 | 📝 선택 | |

## 요청/응답 형식

### 1. 파일 업로드 (핵심)
```http
POST /medical/upload
Content-Type: multipart/form-data
Authorization: Bearer {token}

FormData: file={pdf_file}

→ Response:
{
  "success": true,
  "data": {
    "roomId": 123,          // ← 이걸로 채팅방 접속
    "chatRoom": { ... },
    "medicalRecord": { ... }
  }
}
```

### 2. 채팅방 조회 (필수)
```http
GET /medical/chat-rooms/{roomId}
Authorization: Bearer {token}

→ Response:
{
  "success": true,
  "data": {
    "chatRoom": { "id": 123, "title": "...", ... },
    "messages": [
      { "message_type": "user", "content": "...", ... },
      { "message_type": "assistant", "content": "...", ... }
    ],
    "medicalRecord": { ... }
  }
}
```

### 3. 실시간 채팅 (핵심)
```http
POST /rooms/chat-rooms/{roomId}/stream
Content-Type: application/json
Authorization: Bearer {token}

{ "message": "혈압약 복용법이 궁금해요" }

→ Stream Response:
data: {"content": "혈압약은"}
data: {"content": " 보통"}
data: {"content": " 아침에"}
...
data: [DONE]
```

## 프론트엔드 개발 순서

1. **파일 업로드 구현** (`/medical/upload`)
2. **채팅방 상세 페이지** (`/medical/chat-rooms/{roomId}`)  
3. **실시간 채팅** (`/rooms/chat-rooms/{roomId}/stream`)
4. **채팅방 목록** (`/medical/chat-rooms`)
5. **삭제 기능들** (선택사항)

## 에러 코드

| 상태 코드 | 의미 | 처리 방법 |
|-----------|------|-----------|
| 200 | 성공 | 정상 처리 |
| 400 | 잘못된 요청 | 에러 메시지 표시 |
| 401 | 인증 실패 | 재로그인 유도 |
| 403 | 권한 없음 | 접근 거부 안내 |
| 404 | 리소스 없음 | "존재하지 않는 채팅방" 안내 |
| 500 | 서버 에러 | "잠시 후 다시 시도" 안내 |

## 환경 변수 (백엔드)

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
OPENAI_API_KEY=sk-proj-...
JWT_SECRET=your-jwt-secret
```

## 보안 주의사항

1. **모든 요청에 Bearer 토큰 필수**
2. **파일 크기 제한: 10MB**
3. **PDF 파일만 업로드 가능**
4. **진료 기록 검증 후 저장**
5. **사용자별 데이터 격리 (RLS 적용)** 