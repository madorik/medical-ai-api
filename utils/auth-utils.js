const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'default-jwt-secret-change-in-production';

/**
 * JWT 토큰 검증 미들웨어
 * Authorization 헤더 또는 요청 본문에서 토큰을 추출하여 검증
 */
const verifyToken = (req, res, next) => {
  try {
    let token = null;
    
    // Authorization 헤더에서 토큰 추출
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    // 헤더에 토큰이 없으면 요청 본문에서 확인
    if (!token && req.body && req.body.token) {
      token = req.body.token;
    }
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: '인증 토큰이 필요합니다.',
        message: 'Authorization 헤더에 Bearer 토큰을 포함하거나 요청 본문에 token을 포함해주세요.'
      });
    }
    
    // 토큰 검증
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
    
  } catch (error) {
    console.error('토큰 검증 실패:', error.message);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: '잘못된 토큰입니다.',
        message: '유효하지 않은 JWT 토큰입니다.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: '토큰이 만료되었습니다.',
        message: '다시 로그인해주세요.'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: '토큰 검증 중 오류가 발생했습니다.',
      message: '잠시 후 다시 시도해주세요.'
    });
  }
};

/**
 * 선택적 인증 미들웨어
 * 토큰이 있으면 검증하고, 없어도 요청을 계속 진행
 */
const optionalAuth = (req, res, next) => {
  try {
    let token = null;
    
    // Authorization 헤더에서 토큰 추출
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    // 토큰이 있으면 검증 시도
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
      } catch (error) {
        // 토큰이 잘못되어도 요청은 계속 진행
        console.warn('선택적 인증에서 토큰 검증 실패:', error.message);
      }
    }
    
    next();
    
  } catch (error) {
    console.error('선택적 인증 중 오류:', error);
    next(); // 오류가 있어도 요청은 계속 진행
  }
};

/**
 * 관리자 권한 확인 미들웨어
 * verifyToken 이후에 사용해야 함
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: '인증이 필요합니다.',
      message: '먼저 로그인해주세요.'
    });
  }
  
  if (!req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      error: '관리자 권한이 필요합니다.',
      message: '이 기능에 접근할 권한이 없습니다.'
    });
  }
  
  next();
};

/**
 * JWT 토큰 생성
 * @param {Object} user - 사용자 정보
 * @returns {string} JWT 토큰
 */
const generateToken = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin || false
  };
  
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d',
    issuer: 'medical-ai-api'
  });
};

/**
 * 토큰에서 사용자 정보 추출 (검증 없이)
 * @param {string} token - JWT 토큰
 * @returns {Object|null} 디코드된 페이로드 또는 null
 */
const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    console.error('토큰 디코딩 실패:', error.message);
    return null;
  }
};

module.exports = {
  verifyToken,
  optionalAuth,
  requireAdmin,
  generateToken,
  decodeToken
}; 