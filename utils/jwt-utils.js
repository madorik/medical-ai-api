const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d'; // 토큰 유효기간

/**
 * JWT 토큰을 생성하는 함수
 * @param {Object} user - 사용자 정보 객체
 * @returns {string} JWT 토큰
 */
const generateToken = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name
  };
  
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'ai-learning-api'
  });
};

/**
 * JWT 토큰을 검증하는 함수
 * @param {string} token - 검증할 JWT 토큰
 * @returns {Object|null} 토큰이 유효하면 디코드된 페이로드, 무효하면 null
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.error('JWT 토큰 검증 실패:', error.message);
    return null;
  }
};

/**
 * Authorization 헤더에서 Bearer 토큰을 추출하는 함수
 * @param {string} authHeader - Authorization 헤더 값
 * @returns {string|null} 토큰 또는 null
 */
const extractTokenFromHeader = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7); // 'Bearer ' 제거
};

/**
 * JWT 토큰 인증 미들웨어
 * Authorization 헤더의 토큰을 검증하고 req.user에 사용자 정보 설정
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = extractTokenFromHeader(authHeader);
  
  if (!token) {
    return res.status(401).json({
      error: '액세스 토큰이 필요합니다.',
      message: 'Authorization 헤더에 Bearer 토큰을 포함해주세요.'
    });
  }
  
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({
      error: '유효하지 않거나 만료된 토큰입니다.',
      message: '다시 로그인해주세요.'
    });
  }
  
  req.user = decoded;
  next();
};

/**
 * 선택적 JWT 토큰 인증 미들웨어
 * 토큰이 있으면 검증하고, 없어도 요청을 계속 진행
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = extractTokenFromHeader(authHeader);
  
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  
  next();
};

module.exports = {
  generateToken,
  verifyToken,
  extractTokenFromHeader,
  authenticateToken,
  optionalAuth
}; 