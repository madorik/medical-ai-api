const pdf = require('pdf-parse');

/**
 * 파일 내용 추출 함수
 * @param {Buffer} buffer - 파일 버퍼
 * @param {string} mimetype - 파일 MIME 타입
 * @returns {Promise<Object>} 추출된 내용과 메타데이터
 */
async function extractFileContent(buffer, mimetype) {
  try {
    if (mimetype === 'application/pdf') {
      const data = await pdf(buffer);
      return {
        content: data.text,
        metadata: {
          pages: data.numpages,
          info: data.info
        }
      };
    }
    throw new Error('지원하지 않는 파일 형식입니다.');
  } catch (error) {
    console.error('파일 내용 추출 실패:', error);
    throw error;
  }
}

/**
 * 파일 크기를 사람이 읽기 쉬운 형태로 변환
 * @param {number} bytes - 바이트 크기
 * @returns {string} 포맷된 크기 문자열
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 파일 확장자 추출
 * @param {string} filename - 파일명
 * @returns {string} 확장자 (점 포함)
 */
function getFileExtension(filename) {
  return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
}

/**
 * 파일명에서 확장자 제거
 * @param {string} filename - 파일명
 * @returns {string} 확장자가 제거된 파일명
 */
function removeFileExtension(filename) {
  return filename.replace(/\.[^/.]+$/, '');
}

/**
 * 안전한 파일명 생성 (특수문자 제거)
 * @param {string} filename - 원본 파일명
 * @returns {string} 안전한 파일명
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[<>:"/\\|?*]/g, '') // 윈도우에서 금지된 문자 제거
    .replace(/\s+/g, '_') // 공백을 언더스코어로 변경
    .trim();
}

/**
 * MIME 타입 검증
 * @param {string} mimetype - 검증할 MIME 타입
 * @param {Array<string>} allowedTypes - 허용된 MIME 타입 배열
 * @returns {boolean} 유효 여부
 */
function isValidMimeType(mimetype, allowedTypes = ['application/pdf']) {
  return allowedTypes.includes(mimetype);
}

/**
 * UTF-8 문자열 안전 변환
 * @param {string} text - 변환할 텍스트
 * @returns {string} UTF-8로 안전하게 변환된 텍스트
 */
function safeUtf8Encode(text) {
  if (!text) return '';
  return Buffer.from(text, 'utf8').toString('utf8');
}

module.exports = {
  extractFileContent,
  formatFileSize,
  getFileExtension,
  removeFileExtension,
  sanitizeFilename,
  isValidMimeType,
  safeUtf8Encode
}; 