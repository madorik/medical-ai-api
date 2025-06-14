# 프론트엔드 API 사용 가이드

## 1. 전체 플로우 개요

```
파일 업로드 → 채팅방 생성 → AI 분석 → 채팅 → 기록 관리
```

## 2. 인증 (Authentication)

모든 API 요청에는 Authorization 헤더가 필요합니다.

```javascript
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};
```

## 3. 주요 API 엔드포인트

### 3.1 진료 기록 업로드 & 채팅방 생성

**🔥 핵심 API - 파일 업로드하면 바로 채팅방 생성됨**

```javascript
// 1단계: 파일 업로드 + 채팅방 자동 생성
const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch('/medical/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
      // Content-Type은 설정하지 않음 (multipart/form-data 자동 설정)
    },
    body: formData
  });
  
  const result = await response.json();
  
  if (result.success) {
    const roomId = result.data.roomId;  // ← 이걸로 채팅방 접속
    const chatRoom = result.data.chatRoom;
    
    // 채팅방으로 이동
    window.location.href = `/chat?roomId=${roomId}`;
    // 또는 React Router 사용시
    // navigate(`/chat/${roomId}`);
    
    return { roomId, chatRoom };
  }
};
```

**응답 예시:**
```json
{
  "success": true,
  "message": "진료 기록이 성공적으로 업로드되고 분석되었습니다.",
  "data": {
    "roomId": 123,
    "chatRoom": {
      "id": 123,
      "title": "건강검진결과",
      "created_at": "2024-01-15T10:30:00Z"
    },
    "medicalRecord": {
      "id": 456,
      "title": "건강검진결과",
      "file_type": "application/pdf"
    },
    "redirectUrl": "/medical/chat-rooms/123"
  }
}
```

### 3.2 채팅방 목록 조회

```javascript
// 내 채팅방 목록 가져오기
const getChatRooms = async () => {
  const response = await fetch('/medical/chat-rooms', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const result = await response.json();
  return result.data; // 채팅방 배열
};
```

### 3.3 특정 채팅방 조회 (메시지 히스토리 포함)

```javascript
// 채팅방 상세 정보 + 메시지 히스토리
const getChatRoom = async (roomId) => {
  const response = await fetch(`/medical/chat-rooms/${roomId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const result = await response.json();
  return {
    chatRoom: result.data.chatRoom,
    messages: result.data.messages,
    medicalRecord: result.data.medicalRecord
  };
};
```

### 3.4 AI와 채팅 (스트리밍)

```javascript
// 실시간 스트리밍 채팅
const sendMessageStream = async (roomId, message, onChunk) => {
  const response = await fetch(`/rooms/chat-rooms/${roomId}/stream`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message })
  });
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.content) {
            onChunk(data.content); // 실시간으로 텍스트 표시
          }
        } catch (e) {
          // JSON 파싱 에러 무시
        }
      }
    }
  }
};
```

### 3.5 일반 채팅 (스트리밍 없음)

```javascript
// 일반 메시지 전송 (응답 완료 후 받기)
const sendMessage = async (roomId, message) => {
  const response = await fetch(`/rooms/chat-rooms/${roomId}/message`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message })
  });
  
  const result = await response.json();
  return result.data; // { userMessage, assistantMessage }
};
```

### 3.6 진료 기록 관리

```javascript
// 진료 기록 목록
const getMedicalRecords = async () => {
  const response = await fetch('/medical/records', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
};

// 진료 기록 삭제
const deleteMedicalRecord = async (recordId) => {
  const response = await fetch(`/medical/records/${recordId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
};

// 채팅방 삭제
const deleteChatRoom = async (roomId) => {
  const response = await fetch(`/medical/chat-rooms/${roomId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  return response.json();
};
```

## 4. 완전한 사용 예시

### React 컴포넌트 예시

```javascript
import { useState, useEffect } from 'react';

const MedicalChat = () => {
  const [chatRooms, setChatRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');

  // 1. 파일 업로드 + 채팅방 생성
  const handleFileUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch('/medical/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      const result = await response.json();
      if (result.success) {
        const { roomId } = result.data;
        loadChatRoom(roomId); // 새 채팅방 로드
        loadChatRooms(); // 목록 새로고침
      }
    } catch (error) {
      console.error('업로드 실패:', error);
    }
  };

  // 2. 채팅방 목록 로드
  const loadChatRooms = async () => {
    const response = await fetch('/medical/chat-rooms', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await response.json();
    setChatRooms(result.data);
  };

  // 3. 특정 채팅방 로드
  const loadChatRoom = async (roomId) => {
    const response = await fetch(`/medical/chat-rooms/${roomId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await response.json();
    setCurrentRoom(result.data.chatRoom);
    setMessages(result.data.messages);
  };

  // 4. 메시지 전송 (스트리밍)
  const sendMessage = async () => {
    if (!inputMessage.trim() || !currentRoom) return;
    
    const userMessage = inputMessage;
    setInputMessage('');
    
    // 사용자 메시지 즉시 표시
    setMessages(prev => [...prev, {
      message_type: 'user',
      content: userMessage,
      created_at: new Date().toISOString()
    }]);
    
    // AI 응답 스트리밍
    let aiResponse = '';
    setMessages(prev => [...prev, {
      message_type: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
      isStreaming: true
    }]);
    
    const response = await fetch(`/rooms/chat-rooms/${currentRoom.id}/stream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: userMessage })
    });
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              aiResponse += data.content;
              // 실시간으로 메시지 업데이트
              setMessages(prev => prev.map((msg, idx) => 
                idx === prev.length - 1 
                  ? { ...msg, content: aiResponse }
                  : msg
              ));
            }
          } catch (e) {}
        }
      }
    }
    
    // 스트리밍 완료
    setMessages(prev => prev.map((msg, idx) => 
      idx === prev.length - 1 
        ? { ...msg, isStreaming: false }
        : msg
    ));
  };

  useEffect(() => {
    loadChatRooms();
  }, []);

  return (
    <div>
      {/* 파일 업로드 */}
      <input 
        type="file" 
        accept=".pdf"
        onChange={(e) => handleFileUpload(e.target.files[0])}
      />
      
      {/* 채팅방 목록 */}
      <div>
        {chatRooms.map(room => (
          <div key={room.id} onClick={() => loadChatRoom(room.id)}>
            {room.title}
          </div>
        ))}
      </div>
      
      {/* 채팅 화면 */}
      {currentRoom && (
        <div>
          <h3>{currentRoom.title}</h3>
          <div>
            {messages.map((msg, idx) => (
              <div key={idx} className={msg.message_type}>
                {msg.content}
                {msg.isStreaming && <span>...</span>}
              </div>
            ))}
          </div>
          <input 
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          />
          <button onClick={sendMessage}>전송</button>
        </div>
      )}
    </div>
  );
};
```

## 5. 에러 처리

```javascript
const handleApiError = (error, response) => {
  if (response.status === 401) {
    // 토큰 만료 - 재로그인 필요
    window.location.href = '/login';
  } else if (response.status === 400) {
    // 잘못된 요청 - 에러 메시지 표시
    alert(error.message || '잘못된 요청입니다.');
  } else {
    // 서버 에러
    alert('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
  }
};
```

## 6. 주요 포인트

1. **파일 업로드하면 바로 roomId 받음** - 별도 채팅방 생성 API 불필요
2. **스트리밍 채팅** - 실시간으로 AI 응답 표시 가능
3. **진료 기록 컨텍스트** - AI가 업로드된 파일 내용을 알고 답변
4. **메시지 히스토리** - 채팅방별로 대화 기록 유지
5. **CRUD 완비** - 채팅방/진료기록 생성/조회/삭제 모두 가능

이 가이드대로 구현하면 완전한 의료 AI 채팅 시스템을 만들 수 있습니다! 