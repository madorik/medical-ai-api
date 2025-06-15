const express = require('express');
const { authenticateToken } = require('../utils/jwt-utils');
const { supabase } = require('../config/supabase-config');

const router = express.Router();

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

module.exports = router; 