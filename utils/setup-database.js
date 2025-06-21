const { supabase, CREATE_MEDICAL_ANALYSIS_TABLE_SQL, CREATE_CHAT_ROOM_TABLE_SQL } = require('../config/supabase-config');
const { encryptText, isEncrypted, testEncryption } = require('../utils/encryption-utils');

/**
 * 의료 분석 테이블 생성
 */
async function createMedicalAnalysisTable() {
  try {
    const { data, error } = await supabase
      .from('medical_analysis')
      .select('count')
      .limit(1);
    
    if (error && error.code === 'PGRST116') {
      console.log('❌ medical_analysis 테이블이 아직 생성되지 않았습니다.');
      console.log('위의 SQL을 실행한 후 다시 시도해주세요.');
    } else if (error) {
      console.log('⚠️  테이블 확인 중 오류:', error.message);
    } else {
      console.log('✅ medical_analysis 테이블이 이미 존재합니다.');
    }
    
  } catch (error) {
    console.error('테이블 생성 중 오류:', error.message);
  }
}

/**
 * 채팅방 테이블 생성
 */
async function createChatRoomTable() {
  try {
    const { data, error } = await supabase
      .from('chat_room')
      .select('count')
      .limit(1);
    
    if (error && error.code === 'PGRST116') {
      console.log('❌ chat_room 테이블이 아직 생성되지 않았습니다.');
      console.log('위의 SQL을 실행한 후 다시 시도해주세요.');
    } else if (error) {
      console.log('⚠️  채팅방 테이블 확인 중 오류:', error.message);
    } else {
      console.log('✅ chat_room 테이블이 이미 존재합니다.');
    }
    
  } catch (error) {
    console.error('채팅방 테이블 생성 중 오류:', error.message);
  }
}

/**
 * 데이터베이스 설정 확인
 */
async function checkDatabaseSetup() {
  try {
    console.log('🔍 데이터베이스 설정을 확인하고 있습니다...\n');
    
    // 연결 테스트
    const { data: testData, error: testError } = await supabase
      .from('medical_analysis')
      .select('id')
      .limit(1);
    
    if (testError && testError.code === 'PGRST116') {
      console.log('❌ medical_analysis 테이블이 존재하지 않습니다.');
      console.log('💡 createMedicalAnalysisTable() 함수를 실행하여 테이블을 생성하세요.\n');
      return false;
    } else if (testError) {
      console.log('⚠️  데이터베이스 연결 오류:', testError.message);
      return false;
    } else {
      console.log('✅ medical_analysis 테이블이 정상적으로 설정되었습니다.');
      
      // 데이터 개수 확인
      const { count, error: countError } = await supabase
        .from('medical_analysis')
        .select('*', { count: 'exact', head: true });
      
      if (!countError) {
        console.log(`📊 현재 저장된 분석 결과: ${count}개\n`);
      }
      
      return true;
    }
    
  } catch (error) {
    console.error('데이터베이스 설정 확인 중 오류:', error.message);
    return false;
  }
}

/**
 * 기존 테이블에 document_type 컬럼 추가
 */
async function addDocumentTypeColumn() {
  try {
    console.log('🔧 medical_analysis 테이블에 document_type 컬럼을 추가하고 있습니다...\n');
    
    // document_type 컬럼 추가
    const { error: alterError } = await supabase.rpc('add_document_type_column', {});
    
    if (alterError && !alterError.message.includes('already exists')) {
      console.log('⚠️  수동으로 다음 SQL을 실행해주세요:');
      console.log('');
      console.log('ALTER TABLE medical_analysis ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT \'other\';');
      console.log('CREATE INDEX IF NOT EXISTS idx_medical_analysis_document_type ON medical_analysis(document_type);');
      console.log('');
      return false;
    }
    
    console.log('✅ document_type 컬럼이 성공적으로 추가되었습니다.');
    return true;
    
  } catch (error) {
    console.log('⚠️  컬럼 추가 중 오류가 발생했습니다. 수동으로 다음 SQL을 실행해주세요:');
    console.log('');
    console.log('ALTER TABLE medical_analysis ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT \'other\';');
    console.log('CREATE INDEX IF NOT EXISTS idx_medical_analysis_document_type ON medical_analysis(document_type);');
    console.log('');
    return false;
  }
}

/**
 * 기존 테이블에 result 컬럼 추가
 */
async function addResultColumn() {
  try {
    console.log('🔧 medical_analysis 테이블에 result 컬럼을 추가하고 있습니다...\n');
    
    // result 컬럼 추가
    const { error: alterError } = await supabase.rpc('add_result_column', {});
    
    if (alterError && !alterError.message.includes('already exists')) {
      console.log('⚠️  수동으로 다음 SQL을 실행해주세요:');
      console.log('');
      console.log('ALTER TABLE medical_analysis ADD COLUMN IF NOT EXISTS result TEXT;');
      console.log('');
      return false;
    }
    
    console.log('✅ result 컬럼이 성공적으로 추가되었습니다.');
    return true;
    
  } catch (error) {
    console.log('⚠️  컬럼 추가 중 오류가 발생했습니다. 수동으로 다음 SQL을 실행해주세요:');
    console.log('');
    console.log('ALTER TABLE medical_analysis ADD COLUMN IF NOT EXISTS result TEXT;');
    console.log('');
    return false;
  }
}

/**
 * 기존 데이터 암호화 마이그레이션
 */
async function encryptExistingData() {
  try {
    console.log('🔐 기존 분석 결과 데이터를 암호화하고 있습니다...\n');
    
    // 모든 분석 결과 조회
    const { data: allResults, error: selectError } = await supabase
      .from('medical_analysis')
      .select('id, summary');
    
    if (selectError) {
      console.error('데이터 조회 오류:', selectError);
      return false;
    }
    
    if (!allResults || allResults.length === 0) {
      console.log('✅ 암호화할 데이터가 없습니다.');
      return true;
    }
    
    let encryptedCount = 0;
    let skippedCount = 0;
    
    // 각 레코드 처리
    for (const result of allResults) {
      try {
        // 이미 암호화된 데이터는 건너뛰기
        if (isEncrypted(result.summary)) {
          skippedCount++;
          continue;
        }
        
        // 데이터 암호화
        const encryptedSummary = encryptText(result.summary);
        
        // 암호화된 데이터로 업데이트
        const { error: updateError } = await supabase
          .from('medical_analysis')
          .update({ summary: encryptedSummary })
          .eq('id', result.id);
        
        if (updateError) {
          console.error(`ID ${result.id} 업데이트 오류:`, updateError);
          continue;
        }
        
        encryptedCount++;
        
      } catch (error) {
        console.error(`ID ${result.id} 암호화 중 오류:`, error);
      }
    }
    
    console.log(`✅ 데이터 암호화 완료:`);
    console.log(`   - 암호화된 레코드: ${encryptedCount}개`);
    console.log(`   - 건너뛴 레코드: ${skippedCount}개`);
    console.log(`   - 전체 레코드: ${allResults.length}개\n`);
    
    return true;
    
  } catch (error) {
    console.error('데이터 암호화 마이그레이션 중 오류:', error);
    return false;
  }
}

// 스크립트가 직접 실행된 경우
if (require.main === module) {
  async function main() {
    console.log('🚀 Medical AI API 데이터베이스 설정 유틸리티\n');
    
    // 암호화 시스템 테스트
    console.log('1️⃣ 암호화 시스템 테스트');
    const encryptionWorking = testEncryption();
    
    if (!encryptionWorking) {
      console.log('\n❌ 암호화 시스템에 문제가 있습니다. ENCRYPTION_KEY 환경변수를 확인하세요.');
      return;
    }
    
    console.log('\n2️⃣ 데이터베이스 설정 확인');
    const isSetup = await checkDatabaseSetup();
    
    if (!isSetup) {
      console.log('\n3️⃣ 테이블 생성');
      await createMedicalAnalysisTable();
      await createChatRoomTable();
    } else {
      console.log('\n3️⃣ 스키마 업데이트');
      // 기존 테이블이 있으면 document_type 컬럼 추가 시도
      await addDocumentTypeColumn();
      
      // result 컬럼 추가
      console.log('\n🔧 result 컬럼 추가');
      await addResultColumn();
      
      // 채팅방 테이블 생성 (새로운 테이블이므로 항상 시도)
      console.log('\n📋 채팅방 테이블 생성');
      await createChatRoomTable();
      
      console.log('\n4️⃣ 데이터 암호화 마이그레이션');
      // 기존 데이터 암호화 마이그레이션
      await encryptExistingData();
    }
    
    console.log('✨ 모든 설정이 완료되었습니다.\n');
    console.log('📋 필수 테이블 SQL:');
    console.log('🏥 의료 분석 테이블:');
    console.log(CREATE_MEDICAL_ANALYSIS_TABLE_SQL);
    console.log('\n💬 채팅방 테이블:');
    console.log(CREATE_CHAT_ROOM_TABLE_SQL);
    console.log('\n📋 추가 참고사항:');
    console.log('  - 의료 데이터는 AES256-GCM으로 암호화되어 저장됩니다');
    console.log('  - 문서 유형이 자동으로 분류되어 저장됩니다');
    console.log('  - 각 분석마다 새로운 채팅방이 자동으로 생성됩니다');
    console.log('  - ENCRYPTION_KEY 환경변수를 안전하게 관리하세요\n');
  }
  
  main().catch(console.error);
}

module.exports = {
  createMedicalAnalysisTable,
  createChatRoomTable,
  checkDatabaseSetup,
  addDocumentTypeColumn,
  addResultColumn,
  encryptExistingData
}; 