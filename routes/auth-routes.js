const express = require('express');
const passport = require('passport');
const { generateToken, authenticateToken } = require('../utils/jwt-utils');
const { getUserStatsByProvider, getUserById } = require('../config/passport-config');
const { supabase } = require('../config/supabase-config');

const router = express.Router();

/**
 * Google OAuth 로그인 시작
 * GET /auth/google
 */
router.get('/google', 
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

/**
 * Google OAuth 콜백 처리
 * GET /auth/google/callback
 */
router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: '/auth/login/failed'
  }),
  (req, res) => {
    try {
      // JWT 토큰 생성
      const token = generateToken(req.user);
      const frontUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUrl = `${frontUrl}/auth/success?token=${token}`;

      res.redirect(redirectUrl);
      
    } catch (error) {
      console.error('OAuth 콜백 처리 중 오류:', error);
      res.redirect('/auth/login/failed');
    }
  }
);

/**
 * 로그인 실패 처리
 * GET /auth/login/failed
 */
router.get('/login/failed', (req, res) => {
  res.status(401).json({
    error: 'Google 로그인에 실패했습니다.',
    message: '다시 시도해주세요.',
    loginUrl: '/auth/google'
  });
});

/**
 * 로그인 성공 후 사용자 정보 확인 (토큰 기반)
 * GET /auth/profile
 * Authorization: Bearer <token> 헤더 필요
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    // Supabase에서 최신 사용자 정보 조회
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.id)
      .single();
    
    if (error) {
      console.error('사용자 정보 조회 오류:', error);
      return res.status(404).json({
        error: '사용자 정보를 찾을 수 없습니다.',
        message: error.message
      });
    }
    
    if (!user) {
      return res.status(404).json({
        error: '사용자 정보를 찾을 수 없습니다.',
        message: '해당 ID의 사용자가 존재하지 않습니다.'
      });
    }
    
    // 민감한 정보 제외하고 응답
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.first_name,
        lastName: user.last_name,
        socialId: user.social_id,
        socialProvider: user.social_provider,
        profileImage: user.profile_image,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      message: '사용자 정보 조회 성공'
    });
    
  } catch (error) {
    console.error('사용자 정보 조회 중 오류:', error);
    res.status(500).json({
      error: '사용자 정보 조회 중 오류가 발생했습니다.',
      message: error.message
    });
  }
});

/**
 * 토큰 유효성 검증
 * POST /auth/verify-token
 */
router.post('/verify-token', authenticateToken, async (req, res) => {
  try {
    // Supabase에서 최신 사용자 정보 조회
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, social_provider, profile_image')
      .eq('id', req.user.id)
      .single();
    
    if (error || !user) {
      return res.status(404).json({
        valid: false,
        error: '사용자 정보를 찾을 수 없습니다.'
      });
    }
    
    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        socialProvider: user.social_provider,
        profileImage: user.profile_image
      },
      message: '유효한 토큰입니다.'
    });
    
  } catch (error) {
    console.error('토큰 검증 중 오류:', error);
    res.status(500).json({
      valid: false,
      error: '토큰 검증 중 오류가 발생했습니다.',
      message: error.message
    });
  }
});

/**
 * 로그아웃
 * POST /auth/logout
 */
router.post('/logout', (req, res) => {
  // 세션 기반 로그아웃
  req.logout((err) => {
    if (err) {
      console.error('로그아웃 중 오류:', err);
      return res.status(500).json({
        error: '로그아웃 처리 중 오류가 발생했습니다.'
      });
    }
    
    // 세션 제거
    req.session.destroy((err) => {
      if (err) {
        console.error('세션 제거 중 오류:', err);
      }
      
      res.json({
        success: true,
        message: '성공적으로 로그아웃되었습니다.',
        note: '클라이언트에서 저장된 토큰도 제거해주세요.'
      });
    });
  });
});

/**
 * 현재 로그인 상태 확인 (세션 기반)
 * GET /auth/status
 */
router.get('/status', async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      // Supabase에서 최신 사용자 정보 조회
      const { data: user, error } = await supabase
        .from('users')
        .select('id, email, name, social_provider, profile_image')
        .eq('id', req.user.id)
        .single();
      
      if (error || !user) {
        return res.json({
          authenticated: false,
          message: '사용자 정보를 찾을 수 없습니다.'
        });
      }
      
      res.json({
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          socialProvider: user.social_provider,
          profileImage: user.profile_image
        }
      });
      
    } catch (error) {
      console.error('세션 상태 확인 중 오류:', error);
      res.json({
        authenticated: false,
        message: '세션 확인 중 오류가 발생했습니다.'
      });
    }
  } else {
    res.json({
      authenticated: false,
      message: '로그인이 필요합니다.'
    });
  }
});

/**
 * 특정 사용자 정보 조회 (관리자용 또는 본인 확인)
 * GET /auth/user/:userId
 */
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // UUID 형식 검증
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return res.status(400).json({
        error: '유효하지 않은 사용자 ID 형식입니다.',
        message: 'UUID 형식이어야 합니다.'
      });
    }
    
    // 본인 정보만 조회 가능 (관리자 권한은 향후 추가 가능)
    if (req.user.id !== userId) {
      return res.status(403).json({
        error: '권한이 없습니다.',
        message: '본인의 정보만 조회할 수 있습니다.'
      });
    }
    
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) {
      console.error('사용자 정보 조회 오류:', error);
      return res.status(404).json({
        error: '사용자 정보를 찾을 수 없습니다.',
        message: error.message
      });
    }
    
    if (!user) {
      return res.status(404).json({
        error: '사용자 정보를 찾을 수 없습니다.',
        message: '해당 ID의 사용자가 존재하지 않습니다.'
      });
    }
    
    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.first_name,
        lastName: user.last_name,
        socialId: user.social_id,
        socialProvider: user.social_provider,
        profileImage: user.profile_image,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      message: '사용자 정보 조회 성공'
    });
    
  } catch (error) {
    console.error('사용자 정보 조회 중 오류:', error);
    res.status(500).json({
      error: '사용자 정보 조회 중 오류가 발생했습니다.',
      message: error.message
    });
  }
});

module.exports = router; 