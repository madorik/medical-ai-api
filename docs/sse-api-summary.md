# 🔄 SSE 기반 의료 AI API 시스템

## 📋 개요

새로운 SSE(Server-Sent Events) 기반 API 시스템으로 실시간 상호작용을 지원합니다.
roomId가 없어도 자동으로 채팅방이 생성되며, 모든 과정이 실시간으로 프론트엔드에 전달됩니다.

## 🚀 핵심 특징

### ✨ 자동 채팅방 생성
- 파일 분석이나 메시지 전송 시 roomId가 없으면 자동 생성
- 프론트엔드에 실시간으로 새 채팅방 정보 전달

### 📡 실시간 스트리밍
- 파일 분석 진행상황 실시간 표시
- AI 응답 토큰별 스트리밍
- 채팅방 목록 실시간 업데이트

### ⚠️ 응급상황 감지
- 위험 키워드 실시간 감지
- 즉시 응급 알림 전송

## 🎯 새로운 API 엔드포인트

### 1. 파일 분석 스트리밍
```
POST /stream/analyze-stream
```

**기능:**
- PDF 파일 업로드 및 실시간 분석
- roomId 없으면 자동 채팅방 생성
- 전체 과정 SSE로 스트리밍

**SSE 이벤트:**
```javascript
// 진행상황
{ type: 'analysis_progress', data: { status, message } }

// 채팅방 생성
{ type: 'room_created', data: { roomId, title, created_at } }

// 분석 결과 스트리밍
{ type: 'analysis_chunk', data: { content, accumulated } }

// 완료
{ type: 'analysis_complete', data: { roomId, summary } }

// 오류
{ type: 'error', data: { message } }
```

### 2. 채팅 스트리밍
```
POST /stream/chat-stream
```

**기능:**
- 메시지 전송 및 AI 응답 스트리밍
- roomId 없으면 자동 채팅방 생성
- 응급상황 실시간 감지

**SSE 이벤트:**
```javascript
// 채팅방 생성
{ type: 'room_created', data: { roomId, title } }

// AI 응답 스트리밍
{ type: 'chat_chunk', data: { content, done, isEmergency } }

// 응급상황 감지
{ type: 'emergency_detected', data: { message } }

// 오류
{ type: 'error', data: { message } }
```

### 3. 채팅방 목록 실시간
```
GET /stream/rooms-stream
```

**기능:**
- 채팅방 목록 실시간 구독
- 새 채팅방 생성시 자동 알림
- 30초마다 heartbeat

**SSE 이벤트:**
```javascript
// 초기 목록
{ type: 'rooms_list', data: { rooms: [...] } }

// 새 채팅방 추가
{ type: 'room_added', data: { room: {...} } }

// 채팅방 업데이트
{ type: 'room_updated', data: { roomId, updates: {...} } }

// 채팅방 삭제
{ type: 'room_deleted', data: { roomId } }
```

## 💻 JavaScript SDK 사용법

### 기본 설정
```javascript
const client = new MedicalSSEClient();
client.setAuthToken('your-jwt-token');
```

### 파일 분석
```javascript
const connection = client.analyzeFile(file, roomId, {
  onProgress: (data) => console.log('진행:', data.message),
  onAnalysisChunk: (data) => appendResult(data.content),
  onComplete: (data) => console.log('완료:', data.roomId),
  onRoomCreated: (data) => updateRoomId(data.roomId),
  onError: (error) => showError(error.message)
});
```

### 채팅 메시지 전송
```javascript
const connection = client.sendMessage(message, roomId, {
  onChatChunk: (data) => {
    if (!data.done) appendToChat(data.content);
  },
  onEmergency: (data) => showEmergencyAlert(data.message),
  onRoomCreated: (data) => updateRoomId(data.roomId)
});
```

### 채팅방 목록 구독
```javascript
const connection = client.watchRooms({
  onRoomsList: (data) => renderRooms(data.rooms),
  onRoomAdded: (data) => addRoom(data.room),
  onRoomUpdated: (data) => updateRoom(data.roomId, data.updates)
});
```

## 🎨 UI 헬퍼 클래스

### 파일 업로드 UI
```javascript
const uiHelper = new MedicalUIHelper(client);
uiHelper.setupFileUpload('fileInput', 'progressBar', 'resultArea');
```

### 채팅 UI
```javascript
uiHelper.setupChat('messageInput', 'sendButton', 'chatArea', roomId);
```

### 채팅방 목록 UI
```javascript
const connection = uiHelper.setupRoomsList('roomsList');
```

## 🎭 데모 페이지

### 접속 URL
```
http://localhost:5000/public/sse-demo.html
```

### 주요 기능
- 🎯 파일 드래그 앤 드롭
- 📊 실시간 진행상황 표시
- 💬 실시간 채팅
- 📱 채팅방 목록 실시간 업데이트
- ⚠️ 응급상황 알림

## 🔄 기존 API와의 차이점

### 기존 REST API
```javascript
// 1. 파일 업로드
const uploadResult = await fetch('/medical/upload', {...});

// 2. 채팅방 조회
const rooms = await fetch('/medical/chat-rooms');

// 3. 메시지 전송
const response = await fetch('/rooms/chat-rooms/:roomId/stream', {...});
```

### 새로운 SSE API
```javascript
// 1. 통합 파일 분석 (자동 채팅방 생성)
client.analyzeFile(file, null, callbacks);

// 2. 실시간 채팅방 목록
client.watchRooms(callbacks);

// 3. 통합 메시지 전송 (자동 채팅방 생성)
client.sendMessage(message, null, callbacks);
```

## 🌟 장점

1. **🎯 단순화된 프로세스**: roomId 없어도 자동 처리
2. **⚡ 실시간 피드백**: 모든 과정이 즉시 표시
3. **🔄 자동 동기화**: 여러 탭에서 동일한 상태 유지
4. **⚠️ 즉시 알림**: 응급상황 실시간 감지
5. **📱 반응형 UI**: 실시간 업데이트로 매끄러운 UX

## 🛠️ 기술 스택

- **백엔드**: Node.js + Express + SSE
- **프론트엔드**: Vanilla JavaScript + EventSource
- **AI**: OpenAI GPT-4o-mini
- **DB**: Supabase PostgreSQL
- **인증**: JWT

## 📚 연결 관리

### 자동 정리
```javascript
// 페이지 떠날 때 모든 연결 닫기
window.addEventListener('beforeunload', () => {
  client.closeAllConnections();
});

// 특정 연결만 닫기
connection.close();
```

### 에러 처리
```javascript
// 연결 실패시 자동 재시도 (SDK 내장)
// 네트워크 오류시 graceful degradation
// 인증 만료시 명확한 에러 메시지
```

## 🚀 배포 고려사항

1. **프록시 설정**: SSE 지원하는 리버스 프록시 필요
2. **연결 제한**: 동시 SSE 연결 수 제한 고려
3. **메모리 관리**: 장기간 연결에 대한 메모리 정리
4. **로드밸런싱**: sticky session 또는 Redis pub/sub 고려

이제 완전한 SSE 기반 실시간 의료 AI 상담 시스템이 구축되었습니다! 🎉 