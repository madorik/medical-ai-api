const express = require('express');
const emailService = require('../services/email-service');

const router = express.Router();

/**
 * 이메일 전송 API
 * POST /api/email/send
 */
router.post('/send', async (req, res) => {
  try {
    const { name, email, content } = req.body;

    // 필수 필드 검증
    if (!name || !email || !content) {
      return res.status(400).json({
        error: '필수 필드가 누락되었습니다.',
        message: '사용자 이름(name), 연락처 이메일(email), 문의 내용(content)을 모두 입력해주세요.',
        requiredFields: ['name', 'email', 'content']
      });
    }

    // 필드 길이 검증
    if (name.length > 50) {
      return res.status(400).json({
        error: '사용자 이름이 너무 깁니다.',
        message: '사용자 이름은 50자 이하로 입력해주세요.',
        currentLength: name.length,
        maxLength: 50
      });
    }

    // 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: '올바르지 않은 이메일 형식입니다.',
        message: '유효한 이메일 주소를 입력해주세요.',
        example: 'user@example.com'
      });
    }

    if (email.length > 100) {
      return res.status(400).json({
        error: '이메일 주소가 너무 깁니다.',
        message: '이메일 주소는 100자 이하로 입력해주세요.',
        currentLength: email.length,
        maxLength: 100
      });
    }

    if (content.length > 5000) {
      return res.status(400).json({
        error: '문의 내용이 너무 깁니다.',
        message: '문의 내용은 5000자 이하로 입력해주세요.',
        currentLength: content.length,
        maxLength: 5000
      });
    }

    // 내용 정제 (XSS 방지를 위한 기본적인 HTML 태그 제거)
    const sanitizedData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      content: content.trim()
    };

    // 이메일 전송
    const result = await emailService.sendEmail(sanitizedData);

    res.json({
      success: true,
      message: result.message,
      data: {
        messageId: result.messageId,
        timestamp: new Date().toISOString(),
        senderName: sanitizedData.name,
        senderEmail: sanitizedData.email
      }
    });

  } catch (error) {
    console.error('이메일 전송 API 오류:', error);
    
    res.status(500).json({
      error: '이메일 전송에 실패했습니다.',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 이메일 서비스 상태 확인 API
 * GET /api/email/status
 */
router.get('/status', async (req, res) => {
  try {
    const isConnected = await emailService.verifyConnection();
    
    res.json({
      service: 'Email Service',
      status: isConnected ? 'healthy' : 'unhealthy',
      message: isConnected 
        ? '이메일 서비스가 정상적으로 작동 중입니다.'
        : '이메일 서비스 연결에 문제가 있습니다.',
      timestamp: new Date().toISOString(),
      configuration: {
        provider: 'Gmail SMTP',
        targetEmail: 'xornjs1988@gmail.com',
        emailConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASS)
      }
    });

  } catch (error) {
    console.error('이메일 상태 확인 오류:', error);
    
    res.status(500).json({
      service: 'Email Service',
      status: 'error',
      message: '이메일 서비스 상태 확인에 실패했습니다.',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * 이메일 API 문서 정보
 * GET /api/email/info
 */
router.get('/info', (req, res) => {
  res.json({
    title: '개발자 문의 이메일 API',
    description: '사용자가 개발자에게 문의사항을 이메일로 전송할 수 있는 API입니다.',
    version: '1.0.0',
    endpoints: {
      'POST /api/email/send': {
        description: '개발자 문의 이메일 전송',
        parameters: {
          name: {
            type: 'string',
            required: true,
            maxLength: 50,
            description: '사용자 이름'
          },
          email: {
            type: 'string',
            required: true,
            maxLength: 100,
            format: 'email',
            description: '연락받을 이메일 주소 (답장용)'
          },
          content: {
            type: 'string',
            required: true,
            maxLength: 5000,
            description: '문의 내용'
          }
        },
        example: {
          name: '홍길동',
          email: 'hong@example.com',
          content: '안녕하세요. API 사용 중 궁금한 점이 있어서 문의드립니다.'
        }
      },
      'GET /api/email/status': {
        description: '이메일 서비스 상태 확인',
        parameters: 'none'
      },
      'GET /api/email/info': {
        description: 'API 문서 정보 조회',
        parameters: 'none'
      }
    },
    features: [
      '실시간 이메일 전송',
      '입력 데이터 검증 (이름, 이메일, 내용)',
      '이메일 형식 유효성 검사',
      'HTML 이메일 템플릿',
      '답장 주소 자동 설정 (replyTo)',
      '에러 핸들링',
      'XSS 방지'
    ],
    targetEmail: 'xornjs1988@gmail.com'
  });
});

module.exports = router; 