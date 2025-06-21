require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// 설정 파일들 import
require('./config/passport-config');
const { testConnection } = require('./config/supabase-config');

// 라우터 import
const authRoutes = require('./routes/auth-routes');
const aiRoutes = require('./routes/ai-routes');
const chatRoutes = require('./routes/chat-routes');
const emailRoutes = require('./routes/email-routes');

const app = express();
const PORT = process.env.PORT || 9001;

// 보안 미들웨어 설정
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS 설정 - 클라이언트 요청을 허용
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? [
        'https://medicare-ai-front.vercel.app',
        'https://ttodoc.com',
        'https://www.ttodoc.com',
        process.env.FRONTEND_URL,
      ].filter(Boolean) // undefined 값 제거
    : [
        'http://localhost:3000', 
        'https://medicare-ai-front.vercel.app',
        'https://ttodoc.com',
        'https://www.ttodoc.com',
        process.env.FRONTEND_URL
      ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate Limiting - API 호출 제한
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // 15분당 최대 100회 요청
  message: {
    error: '너무 많은 요청이 발생했습니다.',
    message: '15분 후에 다시 시도해주세요.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// 세션 설정 - Passport 인증을 위해 필요
app.use(session({
  secret: process.env.SESSION_SECRET || 'default-session-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24시간
  }
}));

// Body parsing 미들웨어
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 정적 파일 서빙
app.use('/public', express.static('public'));

// Passport 초기화
app.use(passport.initialize());
app.use(passport.session());

// 라우터 연결
app.use('/auth', authRoutes);
app.use('/api', aiRoutes);
app.use('/chat', chatRoutes);
app.use('/api/email', emailRoutes);

// 기본 루트 엔드포인트
app.get('/', (req, res) => {
  res.json({
    message: '의료 AI API 서버가 정상적으로 실행중입니다.',
    status: 'running',
    timestamp: new Date().toISOString(),
    availableEndpoints: {
      auth: '/auth/google, /auth/google/callback, /auth/status, /auth/profile, /auth/logout',
      medical: '/api/medical/analyze, /api/medical/analysis-history, /api/medical/analysis-stats, /api/medical/check-analysis-limit',
      chatRooms: '/api/medical/chat-rooms (GET/POST), /api/medical/chat-rooms/{roomId} (GET/PUT)',
      chat: '/chat/stream',
      email: '/api/email/send',
      documentation: '/'
    },
    description: '의료 문서 분석 및 AI 상담 서비스'
  });
});

// 404 에러 처리
app.use('*', (req, res) => {
  res.status(404).json({
    error: '요청하신 엔드포인트를 찾을 수 없습니다.',
    message: `${req.method} ${req.originalUrl}는 지원되지 않는 경로입니다.`,
    availableEndpoints: {
      auth: '/auth/profile, /auth/logout',
      medical: '/api/medical/analyze, /api/medical/analysis-history, /api/medical/analysis-stats, /api/medical/check-analysis-limit',
      chatRooms: '/api/medical/chat-rooms (GET/POST), /api/medical/chat-rooms/{roomId} (GET/PUT)',
      chat: '/chat/stream',
      email: '/api/email/send',
      documentation: '/'
    }
  });
});

// 전역 에러 핸들링
app.use((error, req, res, next) => {
  console.error('서버 오류:', error);
  
  // JWT 토큰 관련 에러
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: '잘못된 토큰입니다.',
      message: '유효하지 않은 JWT 토큰입니다.'
    });
  }
  
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: '토큰이 만료되었습니다.',
      message: '다시 로그인해주세요.'
    });
  }

  // 기본 서버 에러
  res.status(500).json({
    error: '서버 내부 오류가 발생했습니다.',
    message: process.env.NODE_ENV === 'development' ? error.message : '잠시 후 다시 시도해주세요.',
    timestamp: new Date().toISOString()
  });
});

// 환경변수 검증 함수
function validateEnvironment() {
  const requiredEnvVars = [
    'OPENAI_API_KEY',
    'GOOGLE_CLIENT_ID', 
    'GOOGLE_CLIENT_SECRET',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY'
  ];

  const optionalEnvVars = [
    'EMAIL_USER',
    'EMAIL_PASS'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.warn('⚠️  다음 필수 환경변수가 설정되지 않았습니다:', missingVars.join(', '));
    console.warn('📝 .env 파일을 확인하고 누락된 값들을 추가해주세요.');
    return false;
  }

  const missingOptionalVars = optionalEnvVars.filter(varName => !process.env[varName]);
  if (missingOptionalVars.length > 0) {
    console.warn('ℹ️  다음 선택적 환경변수가 설정되지 않았습니다:', missingOptionalVars.join(', '));
    console.warn('📧 이메일 기능을 사용하려면 EMAIL_USER, EMAIL_PASS 설정이 필요합니다.');
  }
  
  console.log('✅ 모든 필수 환경변수가 설정되었습니다.');
  return true;
}

// 서버 시작 (개발 환경에서만)
if (process.env.NODE_ENV !== 'production') {
  async function startServer() {
    try {
      // 환경변수 검증
      const envValid = validateEnvironment();
      
      // Supabase 연결 테스트
      if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
        console.log('🔌 Supabase 연결을 확인하는 중...');
        await testConnection();
      } else {
        console.warn('⚠️  Supabase 환경변수가 설정되지 않았습니다.');
      }
      
      // 서버 시작
      app.listen(PORT, () => {
        console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
        console.log(`📝 API 문서: http://localhost:${PORT}`);
        console.log(`🔐 Google OAuth: http://localhost:${PORT}/auth/google`);
        console.log(`💬 의료 상담 채팅: http://localhost:${PORT}/public/medical-chat-demo.html`);
        console.log(`💾 데이터베이스: Supabase PostgreSQL`);
        console.log(`🤖 AI 모델: OpenAI gpt-4o-mini`);
        console.log(`👥 소셜 로그인: Google (확장 가능)`);
        
        if (!envValid) {
          console.log('⚡ 개발 모드로 실행 중 (일부 기능 제한됨)');
        }
      });
      
    } catch (error) {
      console.error('❌ 서버 시작 중 오류가 발생했습니다:', error);
      process.exit(1);
    }
  }

  // 서버 시작
  startServer();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('📴 서버를 종료합니다...');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('📴 서버를 종료합니다...');
    process.exit(0);
  });
}

module.exports = app;