# 📊 데이터베이스 마이그레이션 가이드

## 🎯 개요

이 가이드는 진료 기록 및 채팅방 시스템을 위한 새로운 데이터베이스 테이블을 추가하는 마이그레이션 과정을 설명합니다.

## 📋 추가되는 테이블

### 1. `chat_rooms` - 채팅방 테이블
- 사용자가 파일을 업로드할 때 생성되는 채팅방 정보
- 파일명으로 채팅방 제목 자동 생성

### 2. `medical_records` - 진료 기록 테이블
- 업로드된 파일의 텍스트 내용 저장
- 원본 파일은 저장하지 않음 (보안상 이유)
- 채팅방과 연결되어 관리

### 3. `chat_messages` - 채팅 메시지 테이블
- 각 채팅방의 대화 내용 저장
- 사용자 메시지와 AI 응답을 구분하여 저장

## 🚀 마이그레이션 실행

### 1. Supabase 대시보드에서 실행

1. [Supabase 대시보드](https://supabase.com/dashboard) 접속
2. 프로젝트 선택
3. 왼쪽 메뉴에서 "SQL Editor" 클릭
4. "New query" 버튼 클릭
5. `config/medical-tables-migration.sql` 파일의 내용을 복사하여 붙여넣기
6. "Run" 버튼 클릭하여 실행

### 2. CLI에서 실행 (선택사항)

```bash
# Supabase CLI 설치가 되어있는 경우
supabase db push

# 또는 psql 사용
psql "your-supabase-connection-string" -f config/medical-tables-migration.sql
```

## ✅ 마이그레이션 확인

마이그레이션이 성공적으로 완료되면 다음과 같은 메시지를 확인할 수 있습니다:

```
✅ 진료 기록 및 채팅방 테이블 마이그레이션이 완료되었습니다.
📋 생성된 테이블: chat_rooms, medical_records, chat_messages
🔒 Row Level Security가 모든 테이블에 적용되었습니다.
📊 medical_statistics 뷰가 생성되었습니다.
```

## 🔒 보안 설정

### Row Level Security (RLS)
모든 새로운 테이블에 RLS가 자동으로 적용되어 사용자는 자신의 데이터만 접근할 수 있습니다.

### 정책 (Policies)
- **SELECT**: 사용자는 자신의 데이터만 조회 가능
- **INSERT**: 사용자는 자신의 데이터만 생성 가능
- **UPDATE**: 사용자는 자신의 데이터만 수정 가능
- **DELETE**: 사용자는 자신의 데이터만 삭제 가능

## 📊 테이블 관계도

```
users (기존)
├── chat_rooms (1:N)
│   ├── medical_records (1:1)
│   └── chat_messages (1:N)
└── chat_history (기존, 1:N)
```

## 🔄 기존 데이터 호환성

- 기존 `chat_history` 테이블은 그대로 유지
- 새로운 채팅방 시스템과 기존 채팅 시스템 병행 사용 가능
- 기존 API 엔드포인트는 변경 없이 계속 사용 가능

## 🛠️ 마이그레이션 후 작업

1. **API 테스트**: 새로운 엔드포인트들이 정상 작동하는지 확인
2. **파일 업로드 테스트**: PDF 파일 업로드 및 채팅방 생성 확인
3. **채팅 기능 테스트**: 채팅방별 메시지 저장 확인

## 🆘 롤백 방법

만약 마이그레이션에 문제가 있을 경우:

```sql
-- 테이블 삭제 (데이터 손실 주의!)
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS medical_records CASCADE;
DROP TABLE IF EXISTS chat_rooms CASCADE;
DROP VIEW IF EXISTS medical_statistics;
```

## 💡 참고사항

- 마이그레이션 전에 반드시 데이터베이스 백업을 권장합니다
- 프로덕션 환경에서는 충분한 테스트 후 적용하세요
- 새로운 테이블들은 모두 UUID를 기본키로 사용합니다
- 자동 타임스탬프 업데이트 트리거가 적용됩니다 