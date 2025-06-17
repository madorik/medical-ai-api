const express = require('express');
const { upload, validateFile, formatUploadError } = require('../utils/file-upload-utils');
const { analyzeUploadedMedicalDocumentWithSummary } = require('../services/medical-analysis-service');
const { saveAnalysisResult, getAnalysisResultsByUser } = require('../config/supabase-config');
const { verifyToken } = require('../utils/auth-utils');
const { CATEGORY_NAMES_KR } = require('../utils/medical-document-categories');

const router = express.Router();

/**
 * 진료 기록 업로드 및 분석 (SSE)
 * POST /api/medical/analyze
 */
router.post('/medical/analyze', verifyToken, upload.single('medicalFile'), async (req, res) => {
  // SSE 헤더 설정
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  try {
    // 파일 검증
    if (!req.file) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: '파일이 업로드되지 않았습니다.'
      })}\n\n`);
      return res.end();
    }

    validateFile(req.file);

    // 모델 파라미터 처리 (기본값 4o-mini)
    let modelName = (req.body.model || req.query.model) || '4o-mini';
    if (!modelName.startsWith('gpt-')) {
      modelName = `gpt-${modelName}`;
    }

    // JWT 토큰에서 사용자 ID 추출
    const userId = req.user.id;
    if (!userId) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: '유효한 사용자 인증이 필요합니다.'
      })}\n\n`);
      return res.end();
    }

    // 방 ID 파라미터 처리 (선택)
    const roomId = req.body.roomId || req.query.roomId || null;

    // 분석 시작 알림
    res.write(`data: ${JSON.stringify({
      type: 'status',
      message: '파일 업로드 완료. 문서 카테고리를 분류하고 있습니다...'
    })}\n\n`);

    // 카테고리 분류 및 통합 분석 (요약 포함)
    const result = await analyzeUploadedMedicalDocumentWithSummary(req.file.buffer, req.file.mimetype, modelName);
    
    // 카테고리 분류 결과 전송
    res.write(`data: ${JSON.stringify({
      type: 'classification',
      category: result.classification.category,
      categoryInfo: result.categoryInfo,
      confidence: result.classification.confidence,
      reason: result.classification.reason,
      message: `문서 카테고리: ${result.categoryInfo.name} (신뢰도: ${Math.round(result.classification.confidence * 100)}%)`
    })}\n\n`);

    // 카테고리별 맞춤 분석 시작
    res.write(`data: ${JSON.stringify({
      type: 'status',
      message: `${result.categoryInfo.icon} ${result.categoryInfo.name} 문서를 전문적으로 분석하고 있습니다...`
    })}\n\n`);

    // 스트리밍 분석 결과 처리
    let accumulatedContent = '';
    let tokenCount = 0;
    const MAX_TOKENS = 4000;
    
    for await (const chunk of result.analysisStream) {
      const content = chunk.choices[0]?.delta?.content || '';
      
      if (content) {
        accumulatedContent += content;
        // 분석 내용 누적 (요약 생성용)
        result.accumulateContent(content);
        
        // 대략적인 토큰 카운트 (단어 수 기준)
        tokenCount += content.split(/\s+/).length;
        
        // 실시간으로 부분 응답 전송
        res.write(`data: ${JSON.stringify({
          type: 'chunk',
          content: content
        })}\n\n`);
        
        // 토큰 제한 체크
        if (tokenCount >= MAX_TOKENS) {
          res.write(`data: ${JSON.stringify({
            type: 'info',
            message: `상세 분석이 ${MAX_TOKENS}개 토큰에 도달했습니다. 분석을 완료합니다.`
          })}\n\n`);
          break;
        }
      }
    }

    // 요약 생성 알림
    res.write(`data: ${JSON.stringify({
      type: 'status',
      message: '분석 결과를 요약하고 저장하고 있습니다...'
    })}\n\n`);

    // 요약 생성
    let summary = '';
    try {
      summary = await result.generateSummary();
    } catch (summaryError) {
      console.error('요약 생성 중 오류:', summaryError);
      summary = '분석 완료: 자세한 내용은 전체 분석 결과를 확인해주세요.';
    }

    // 분석 결과를 Supabase에 저장
    let savedAnalysis = null;
    try {
      savedAnalysis = await saveAnalysisResult({
        userId: userId,
        roomId: roomId,
        model: modelName,
        summary: summary
      });
      
      res.write(`data: ${JSON.stringify({
        type: 'info',
        message: '분석 결과가 성공적으로 저장되었습니다.'
      })}\n\n`);
    } catch (saveError) {
      console.error('분석 결과 저장 중 오류:', saveError);
      res.write(`data: ${JSON.stringify({
        type: 'warning',
        message: '분석은 완료되었으나 저장 중 오류가 발생했습니다.'
      })}\n\n`);
    }

    // 분석 완료 알림
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      message: `${result.categoryInfo.icon} ${result.categoryInfo.name} 문서 분석이 완료되었습니다.`,
      category: result.classification.category,
      categoryInfo: result.categoryInfo,
      fullContent: accumulatedContent,
      summary: summary,
      analysisId: savedAnalysis?.id || null
    })}\n\n`);

  } catch (error) {
    console.error('진료 기록 분석 중 오류:', error);
    
    let errorMessage = '진료 기록 분석 중 오류가 발생했습니다.';
    
    if (error.message) {
      if (error.message.includes('의료 문서가 아닙니다')) {
        errorMessage = error.message;
      } else {
        errorMessage = formatUploadError(error);
      }
    }
    
    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: errorMessage
    })}\n\n`);
  } finally {
    res.end();
  }
});

/**
 * 사용자별 분석 결과 조회
 * GET /api/medical/analysis-history
 */
router.get('/medical/analysis-history', verifyToken, async (req, res) => {
  try {
    // JWT 토큰에서 사용자 ID 추출
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    // 사용자 ID 검증
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '유효한 사용자 인증이 필요합니다.'
      });
    }

    // 분석 결과 조회
    const analysisResults = await getAnalysisResultsByUser(userId, limit, offset);

    res.json({
      success: true,
      data: {
        analyses: analysisResults,
        count: analysisResults.length,
        limit: limit,
        offset: offset,
        userId: userId
      },
      message: '분석 결과를 성공적으로 조회했습니다.'
    });

  } catch (error) {
    console.error('분석 결과 조회 중 오류:', error);
    res.status(500).json({
      success: false,
      message: '분석 결과 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

/**
 * 진료 기록 분석 지원 파일 형식 조회
 * GET /api/medical/supported-formats
 */
router.get('/medical/supported-formats', (req, res) => {
  res.json({
    supportedFormats: [
      {
        name: 'JPG',
        mimeType: 'image/jpeg',
        extensions: ['.jpg', '.jpeg'],
        features: ['자동 카테고리 분류', '이미지 직접 분석', '카테고리별 맞춤 분석']
      },
      {
        name: 'PNG', 
        mimeType: 'image/png',
        extensions: ['.png'],
        features: ['자동 카테고리 분류', '이미지 직접 분석', '카테고리별 맞춤 분석']
      },
      {
        name: 'PDF',
        mimeType: 'application/pdf',
        extensions: ['.pdf'],
        features: ['텍스트 추출 분석', '기본 카테고리 분류', '맞춤 분석']
      }
    ],
    supportedCategories: [
      { 
        code: 'medical_record', 
        name: '진료기록',
        icon: '📋',
        description: '의사의 진료 기록과 치료 계획'
      },
      { 
        code: 'prescription', 
        name: '처방전',
        icon: '💊',
        description: '처방된 약물과 복용법'
      },
      { 
        code: 'pharmacy_receipt', 
        name: '약국 영수증',
        icon: '🧾',
        description: '약국에서 조제한 약물과 비용'
      },
      { 
        code: 'lab_result', 
        name: '검사결과',
        icon: '🔬',
        description: '혈액검사 등 임상검사 결과'
      },
      { 
        code: 'health_checkup', 
        name: '건강검진',
        icon: '🏥',
        description: '종합건강검진 결과'
      },
      { 
        code: 'hospital_bill', 
        name: '병원 영수증',
        icon: '💳',
        description: '병원 진료비와 보험 적용 내역'
      },
      { 
        code: 'other', 
        name: '기타',
        icon: '📄',
        description: '기타 의료 관련 문서'
      }
    ],
    maxFileSize: '5MB',
    maxFileSizeBytes: 5 * 1024 * 1024,
    description: '의료 문서를 업로드하면 AI가 자동으로 카테고리를 분류하고 맞춤형 분석을 제공합니다.',
    features: [
      '6가지 카테고리 자동 분류 (이미지 파일)',
      '카테고리별 전문 AI 분석',
      '실시간 스트리밍 분석',
      'Markdown 형식 결과 제공',
      '한국어 의료 용어 지원',
      '아이콘과 색상으로 카테고리 시각화'
    ],
    workflow: [
      '1. 파일 업로드 및 검증',
      '2. 의료 문서 카테고리 자동 분류 (이미지)',
      '3. 카테고리별 맞춤형 AI 분석',
      '4. 실시간 결과 스트리밍 제공'
    ],
    usage: {
      endpoint: '/api/medical/analyze',
      method: 'POST',
      contentType: 'multipart/form-data',
      fieldName: 'medicalFile',
      responseType: 'text/event-stream (SSE)'
    }
  });
});

module.exports = router; 