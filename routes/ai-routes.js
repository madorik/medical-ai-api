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
      message: '파일 업로드 완료. 의료 문서를 상세히 분석하고 있습니다...'
    })}\n\n`);

    // 직접 상세 분석 수행 (요약 포함)
    const result = await analyzeUploadedMedicalDocumentWithSummary(req.file.buffer, req.file.mimetype, modelName);
    
    // 분석 시작 알림 (문서 유형 포함)
    res.write(`data: ${JSON.stringify({
      type: 'status',
      message: `📋 ${result.documentTypeName} 문서를 분석하고 있습니다. 문서의 내용을 자동으로 파악하여 상세히 분석합니다...`
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
        summary: summary,
        documentType: result.documentType
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
      message: `📋 ${result.documentTypeName} 문서 분석이 완료되었습니다.`,
      fullContent: accumulatedContent,
      summary: summary,
      analysisId: savedAnalysis?.id || null,
      documentType: result.documentType,
      documentTypeName: result.documentTypeName
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

    // 결과 포맷팅
    const formattedResults = analysisResults.map(result => ({
      id: result.id,
      model: result.model,
      summary: result.summary,
      document_type: result.document_type || 'other',
      created_at: result.created_at,
      room_id: result.room_id
    }));

    res.json({
      success: true,
      data: formattedResults,
      pagination: {
        limit: limit,
        offset: offset,
        total: analysisResults.length
      }
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

// 카테고리별 분석 결과 통계 (선택적 기능)
router.get('/medical/analysis-stats', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: '유효한 사용자 인증이 필요합니다.'
      });
    }

    // 사용자의 전체 분석 결과 조회
    const analysisResults = await getAnalysisResultsByUser(userId, 1000, 0);
    
    // 문서 유형별 통계 생성
    const documentTypeStats = {};
    analysisResults.forEach(result => {
      const documentType = result.document_type || 'other';
      if (!documentTypeStats[documentType]) {
        documentTypeStats[documentType] = {
          count: 0,
          typeName: CATEGORY_NAMES_KR[documentType] || '기타',
          recentAnalyses: []
        };
      }
      documentTypeStats[documentType].count++;
      
      // 최신 3개 분석 결과만 포함
      if (documentTypeStats[documentType].recentAnalyses.length < 3) {
        documentTypeStats[documentType].recentAnalyses.push({
          id: result.id,
          summary: result.summary.slice(0, 100) + (result.summary.length > 100 ? '...' : ''),
          created_at: result.created_at
        });
      }
    });
    
    // 기본 통계 정보 생성
    const stats = {
      totalAnalyses: analysisResults.length,
      documentTypeStats: documentTypeStats,
      recentAnalyses: analysisResults.slice(0, 5).map(result => ({
        id: result.id,
        date: new Date(result.created_at).toLocaleDateString('ko-KR'),
        summary: result.summary.slice(0, 100) + (result.summary.length > 100 ? '...' : ''),
        documentType: result.document_type || 'other',
        documentTypeName: CATEGORY_NAMES_KR[result.document_type] || '기타',
        model: result.model
      })),
      analysisHistory: analysisResults.map(result => ({
        id: result.id,
        date: new Date(result.created_at).toLocaleDateString('ko-KR'),
        summary: result.summary.slice(0, 100) + (result.summary.length > 100 ? '...' : ''),
        documentType: result.document_type || 'other',
        documentTypeName: CATEGORY_NAMES_KR[result.document_type] || '기타',
        model: result.model
      }))
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('분석 통계 조회 중 오류:', error);
    res.status(500).json({
      success: false,
      message: '분석 통계 조회 중 오류가 발생했습니다.',
      error: error.message
    });
  }
});

module.exports = router; 