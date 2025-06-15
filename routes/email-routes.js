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

module.exports = router; 