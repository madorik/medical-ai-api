const crypto = require('crypto');

// 암호화 설정
const ALGORITHM = 'aes-256-cbc';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits

/**
 * 암호화 키 생성 또는 환경변수에서 가져오기
 */
function getEncryptionKey() {
  const envKey = process.env.ENCRYPTION_KEY;
  
  if (envKey) {
    // 환경변수에서 키를 가져와서 32바이트로 맞춤
    return crypto.createHash('sha256').update(envKey).digest();
  }
  
  // 개발환경용 기본 키 (운영환경에서는 반드시 환경변수 설정 필요)
  console.warn('⚠️  ENCRYPTION_KEY 환경변수가 설정되지 않았습니다. 개발용 기본 키를 사용합니다.');
  return crypto.createHash('sha256').update('medical-ai-default-key-for-development').digest();
}

/**
 * 텍스트를 AES256-CBC로 암호화
 * @param {string} text - 암호화할 텍스트
 * @returns {string} - 암호화된 텍스트 (base64 인코딩)
 */
function encryptText(text) {
  try {
    if (!text || typeof text !== 'string') {
      throw new Error('암호화할 텍스트가 유효하지 않습니다.');
    }

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // IV + 암호화된 데이터를 결합하여 반환
    const combined = iv.toString('hex') + ':' + encrypted;
    return Buffer.from(combined).toString('base64');
    
  } catch (error) {
    console.error('텍스트 암호화 중 오류:', error);
    throw new Error('텍스트 암호화에 실패했습니다.');
  }
}

/**
 * AES256-CBC로 암호화된 텍스트를 복호화
 * @param {string} encryptedText - 암호화된 텍스트 (base64 인코딩)
 * @returns {string} - 복호화된 원본 텍스트
 */
function decryptText(encryptedText) {
  try {
    if (!encryptedText || typeof encryptedText !== 'string') {
      throw new Error('복호화할 텍스트가 유효하지 않습니다.');
    }

    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedText, 'base64').toString();
    
    // IV와 암호화된 데이터 분리
    const parts = combined.split(':');
    if (parts.length !== 2) {
      throw new Error('잘못된 암호화 데이터 형식입니다.');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
    
  } catch (error) {
    console.error('텍스트 복호화 중 오류:', error);
    
    // 암호화되지 않은 기존 데이터일 가능성 체크
    if (error.message.includes('bad decrypt') || 
        error.message.includes('Invalid') || 
        error.message.includes('wrong final block length') ||
        error.message.includes('잘못된 암호화 데이터 형식')) {
      console.warn('⚠️  암호화되지 않은 기존 데이터로 추정됩니다. 원본 텍스트를 반환합니다.');
      return encryptedText; // 암호화되지 않은 원본 데이터 반환
    }
    
    throw new Error('텍스트 복호화에 실패했습니다.');
  }
}

/**
 * 텍스트가 암호화되어 있는지 확인
 * @param {string} text - 확인할 텍스트
 * @returns {boolean} - 암호화 여부
 */
function isEncrypted(text) {
  try {
    if (!text || typeof text !== 'string') {
      return false;
    }
    
    // Base64로 인코딩되어 있고, 디코딩했을 때 ':' 구분자가 있는지 확인
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(text)) {
      return false;
    }
    
    const decoded = Buffer.from(text, 'base64').toString();
    const parts = decoded.split(':');
    
    // IV(32자리 hex) + ':' + 암호화된 데이터 형식인지 확인
    return parts.length === 2 && parts[0].length === 32 && /^[a-f0-9]+$/i.test(parts[0]);
    
  } catch (error) {
    return false;
  }
}

/**
 * 안전한 복호화 (기존 암호화되지 않은 데이터 호환)
 * @param {string} text - 복호화할 텍스트
 * @returns {string} - 복호화된 텍스트 또는 원본 텍스트
 */
function safeDecrypt(text) {
  try {
    if (!text) {
      return '';
    }
    
    // 암호화된 데이터인지 확인
    if (isEncrypted(text)) {
      return decryptText(text);
    } else {
      // 암호화되지 않은 기존 데이터
      return text;
    }
    
  } catch (error) {
    console.warn('복호화 실패, 원본 텍스트 반환:', error.message);
    return text;
  }
}

/**
 * 암호화 시스템 테스트
 */
function testEncryption() {
  try {
    console.log('🔧 암호화 시스템을 테스트하고 있습니다...\n');
    
    const testTexts = [
      '환자의 혈액검사 결과가 정상 범위 내에 있습니다.',
      '진료 기록: 감기 증상으로 내원, 해열제 처방',
      'Patient has diabetes type 2, needs medication adjustment',
      '건강검진 결과 - 콜레스테롤 수치 높음, 식이요법 필요'
    ];
    
    let passedTests = 0;
    
    for (let i = 0; i < testTexts.length; i++) {
      const originalText = testTexts[i];
      
      try {
        // 암호화
        const encrypted = encryptText(originalText);
        console.log(`테스트 ${i + 1}:`);
        console.log(`  원본: ${originalText.slice(0, 30)}...`);
        console.log(`  암호화됨: ${encrypted.slice(0, 50)}...`);
        
        // 복호화
        const decrypted = decryptText(encrypted);
        console.log(`  복호화됨: ${decrypted.slice(0, 30)}...`);
        
        // 검증
        if (originalText === decrypted) {
          console.log(`  ✅ 성공\n`);
          passedTests++;
        } else {
          console.log(`  ❌ 실패 - 원본과 복호화 결과가 다름\n`);
        }
        
      } catch (error) {
        console.log(`  ❌ 실패 - ${error.message}\n`);
      }
    }
    
    console.log(`암호화 테스트 완료: ${passedTests}/${testTexts.length} 성공`);
    
    // 안전한 복호화 테스트
    console.log('\n🔧 안전한 복호화 테스트...');
    const plainText = '암호화되지 않은 기존 데이터';
    const safeResult = safeDecrypt(plainText);
    console.log(`원본: ${plainText}`);
    console.log(`안전한 복호화 결과: ${safeResult}`);
    console.log(plainText === safeResult ? '✅ 성공' : '❌ 실패');
    
    return passedTests === testTexts.length;
    
  } catch (error) {
    console.error('암호화 테스트 중 오류:', error);
    return false;
  }
}

module.exports = {
  encryptText,
  decryptText,
  safeDecrypt,
  isEncrypted,
  testEncryption
}; 