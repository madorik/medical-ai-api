const multer = require('multer');
const path = require('path');

// 파일 크기 제한 (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// 허용되는 파일 타입
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'application/pdf'
];

// 파일 확장자 검증
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];

/**
 * multer 설정 - 메모리에 파일 저장
 */
const storage = multer.memoryStorage();

/**
 * 파일 필터 함수
 */
const fileFilter = (req, file, cb) => {
  // MIME 타입 검증
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('지원되지 않는 파일 형식입니다. JPG, PNG, PDF 파일만 업로드 가능합니다.'), false);
  }
  
  // 파일 확장자 검증
  const fileExtension = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
    return cb(new Error('지원되지 않는 파일 확장자입니다.'), false);
  }
  
  cb(null, true);
};

/**
 * multer 업로드 설정
 */
const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1 // 한 번에 하나의 파일만 업로드
  },
  fileFilter: fileFilter
});

/**
 * 파일 유효성 검증
 */
function validateFile(file) {
  if (!file) {
    throw new Error('파일이 업로드되지 않았습니다.');
  }
  
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`파일 크기가 너무 큽니다. 최대 ${MAX_FILE_SIZE / (1024 * 1024)}MB까지 업로드 가능합니다.`);
  }
  
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new Error('지원되지 않는 파일 형식입니다. JPG, PNG, PDF 파일만 업로드 가능합니다.');
  }
  
  return true;
}

/**
 * 에러 메시지 포맷팅
 */
function formatUploadError(error) {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return '파일 크기가 5MB를 초과했습니다.';
  }
  
  if (error.code === 'LIMIT_FILE_COUNT') {
    return '한 번에 하나의 파일만 업로드할 수 있습니다.';
  }
  
  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return '예상치 못한 필드명입니다. "medicalFile" 필드를 사용해주세요.';
  }
  
  return error.message || '파일 업로드 중 오류가 발생했습니다.';
}

module.exports = {
  upload,
  validateFile,
  formatUploadError,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS
}; 