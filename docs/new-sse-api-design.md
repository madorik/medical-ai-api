# 새로운 SSE 기반 API 설계

## 🔄 변경된 프로세스

### 1. 파일 분석 (SSE)
```
POST /api/analyze-stream
- roomId 파라미터 선택적
- roomId 없으면 자동 생성
- 전체 과정 SSE로 실시간 전달
```

### 2. 메시지 전송 (SSE)  
```
POST /api/chat-stream
- roomId 파라미터 선택적
- roomId 없으면 자동 생성
- AI 응답 실시간 스트리밍
```

### 3. 채팅방 목록 (SSE)
```
GET /api/rooms-stream
- 채팅방 목록 실시간 업데이트
- 새 채팅방 생성시 자동 알림
```

## 📡 SSE 이벤트 타입

### 파일 분석 이벤트
```javascript
// 채팅방 생성
{ type: 'room_created', data: { roomId, title, created_at } }

// 분석 진행상황
{ type: 'analysis_progress', data: { status, message } }

// 분석 결과 스트리밍
{ type: 'analysis_chunk', data: { content, accumulated } }

// 완료
{ type: 'analysis_complete', data: { roomId, summary } }
```

### 채팅 이벤트
```javascript
// 채팅방 생성 (필요시)
{ type: 'room_created', data: { roomId, title } }

// AI 응답 스트리밍
{ type: 'chat_chunk', data: { content, done } }

// 응급상황 감지
{ type: 'emergency_detected', data: { message } }
```

### 채팅방 목록 이벤트
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

## 🎯 프론트엔드 사용법

### 1. 파일 업로드 + 실시간 분석
```javascript
const analyzeFile = (file, roomId = null) => {
  const formData = new FormData();
  formData.append('file', file);
  if (roomId) formData.append('roomId', roomId);

  const eventSource = new EventSource('/api/analyze-stream', {
    method: 'POST',
    body: formData
  });

  eventSource.addEventListener('room_created', (e) => {
    const { roomId, title } = JSON.parse(e.data);
    console.log('새 채팅방 생성:', roomId);
    // UI에 새 채팅방 추가
  });

  eventSource.addEventListener('analysis_progress', (e) => {
    const { status, message } = JSON.parse(e.data);
    console.log('분석 진행:', message);
    // 프로그레스 바 업데이트
  });

  eventSource.addEventListener('analysis_chunk', (e) => {
    const { content } = JSON.parse(e.data);
    // 실시간으로 분석 결과 표시
    appendToAnalysisResult(content);
  });

  eventSource.addEventListener('analysis_complete', (e) => {
    const { roomId, summary } = JSON.parse(e.data);
    console.log('분석 완료:', summary);
    eventSource.close();
    // 채팅방으로 이동
    navigateToRoom(roomId);
  });
};
```

### 2. 메시지 전송 + 실시간 응답
```javascript
const sendMessage = (message, roomId = null) => {
  const eventSource = new EventSource('/api/chat-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, roomId })
  });

  eventSource.addEventListener('room_created', (e) => {
    const { roomId } = JSON.parse(e.data);
    updateCurrentRoomId(roomId);
  });

  eventSource.addEventListener('chat_chunk', (e) => {
    const { content, done } = JSON.parse(e.data);
    if (!done) {
      appendToAIResponse(content);
    } else {
      eventSource.close();
    }
  });

  eventSource.addEventListener('emergency_detected', (e) => {
    showEmergencyAlert();
  });
};
```

### 3. 채팅방 목록 실시간 업데이트
```javascript
const watchRoomsList = () => {
  const eventSource = new EventSource('/api/rooms-stream');

  eventSource.addEventListener('rooms_list', (e) => {
    const { rooms } = JSON.parse(e.data);
    setRoomsList(rooms);
  });

  eventSource.addEventListener('room_added', (e) => {
    const { room } = JSON.parse(e.data);
    addRoomToList(room);
  });

  eventSource.addEventListener('room_updated', (e) => {
    const { roomId, updates } = JSON.parse(e.data);
    updateRoomInList(roomId, updates);
  });

  return eventSource; // cleanup용
};
```

## 🚀 구현 장점

1. **실시간 UX**: 모든 과정이 즉시 사용자에게 전달
2. **자동 채팅방 생성**: roomId 없어도 자동 처리
3. **상태 동기화**: 여러 탭에서 동일한 상태 유지
4. **진행 상황 표시**: 파일 분석, AI 응답 등 실시간 피드백
5. **응급상황 즉시 알림**: 위험 상황 실시간 감지

## 📝 기존 API와의 호환성

기존 REST API도 유지하여 호환성 보장:
- `/medical/upload` → 기존 방식
- `/api/analyze-stream` → 새로운 SSE 방식
- `/rooms/chat-rooms/:roomId/stream` → 기존 방식  
- `/api/chat-stream` → 새로운 SSE 방식 