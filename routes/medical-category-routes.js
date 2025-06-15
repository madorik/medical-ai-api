const express = require('express');
const multer = require('multer');
const { verifyToken } = require('../utils/auth-utils');
const { supabase } = require('../config/supabase-config');
const { 
  classifyMedicalDocument, 
  getSupportedCategories 
} = require('../services/document-classification-service');
const { 
  analyzeMedicalDocumentByCategory,
  generateCategorySummary,
  getCategoryInfo
} = require('../services/categorized-medical-analysis-service');
const { formatTextToHtml, formatMedicalAnalysis } = require('../utils/text-formatter');
const { extractFileContent } = require('../utils/file-utils');

const router = express.Router();

// 메모리 스토리지 설정
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB 제한
  },
  fileFilter: (req, file, cb) => {
    // 한글 파일명 UTF-8 인코딩 처리
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    
    // 지원하는 파일 형식 확인
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg', 
      'image/jpg',
      'image/png'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('PDF 또는 이미지 파일(JPG, PNG)만 업로드 가능합니다.'), false);
    }
  }
});

/**
 * 지원되는 의료 문서 카테고리 목록 조회
 * GET /api/medical/categories
 */
router.get('/categories', (req, res) => {
  try {
    const categories = getSupportedCategories();
    
    res.json({
      success: true,
      message: '의료 문서 카테고리 목록을 조회했습니다.',
      data: {
        categories,
        totalCount: categories.length,
        description: '업로드 가능한 의료 문서 카테고리들입니다. 각 카테고리별로 최적화된 분석을 제공합니다.'
      }
    });
    
  } catch (error) {
    console.error('카테고리 목록 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '카테고리 목록 조회에 실패했습니다.'
    });
  }
});

/**
 * 의료 문서 카테고리 분류만 수행 (분석 없이)
 * POST /api/medical/classify
 */
router.post('/classify', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '파일을 선택해주세요.'
      });
    }

    const file = req.file;
    let extractedContent = null;

    // PDF 파일인 경우 텍스트 추출
    if (file.mimetype === 'application/pdf') {
      try {
        const extractedData = await extractFileContent(file.buffer, file.mimetype);
        extractedContent = extractedData.content;
      } catch (extractError) {
        console.error('텍스트 추출 실패:', extractError);
      }
    }

    // 문서 카테고리 분류
    const classificationResult = await classifyMedicalDocument(
      file.buffer, 
      file.mimetype, 
      extractedContent
    );

    // 카테고리 정보 추가
    const categoryInfo = getCategoryInfo(classificationResult.category);

    res.json({
      success: true,
      message: '의료 문서 카테고리 분류가 완료되었습니다.',
      data: {
        classification: classificationResult,
        categoryInfo,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype
      }
    });

  } catch (error) {
    console.error('문서 분류 실패:', error);
    res.status(500).json({
      success: false,
      error: error.message || '문서 분류에 실패했습니다.'
    });
  }
});

/**
 * 카테고리별 맞춤형 의료 문서 분석 (SSE)
 * POST /api/medical/analyze-by-category
 */
router.post('/analyze-by-category', upload.single('file'), async (req, res) => {
  // SSE 헤더 설정
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  try {
    if (!req.file) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: '파일을 선택해주세요.'
      })}\n\n`);
      res.end();
      return;
    }

    const file = req.file;
    let extractedContent = null;

    // 진행 상황 알림
    res.write(`data: ${JSON.stringify({
      type: 'progress',
      message: '파일 업로드 완료, 분석을 시작합니다...',
      progress: 10
    })}\n\n`);

    // PDF 파일인 경우 텍스트 추출
    if (file.mimetype === 'application/pdf') {
      try {
        const extractedData = await extractFileContent(file.buffer, file.mimetype);
        extractedContent = extractedData.content;
        
        res.write(`data: ${JSON.stringify({
          type: 'progress',
          message: 'PDF 텍스트 추출 완료',
          progress: 30
        })}\n\n`);
      } catch (extractError) {
        console.error('텍스트 추출 실패:', extractError);
        res.write(`data: ${JSON.stringify({
          type: 'warning',
          message: '텍스트 추출에 실패했지만 이미지 분석을 진행합니다.'
        })}\n\n`);
      }
    }

    // 1단계: 문서 카테고리 분류
    res.write(`data: ${JSON.stringify({
      type: 'progress',
      message: '의료 문서 카테고리를 분류하고 있습니다...',
      progress: 40
    })}\n\n`);

    const classificationResult = await classifyMedicalDocument(
      file.buffer,
      file.mimetype,
      extractedContent
    );

    const categoryInfo = getCategoryInfo(classificationResult.category);

    res.write(`data: ${JSON.stringify({
      type: 'classification',
      data: {
        category: classificationResult.category,
        categoryName: classificationResult.categoryName,
        confidence: classificationResult.confidence,
        categoryInfo
      }
    })}\n\n`);

    res.write(`data: ${JSON.stringify({
      type: 'progress',
      message: `${categoryInfo.name}으로 분류되었습니다. 맞춤형 분석을 시작합니다...`,
      progress: 60
    })}\n\n`);

    // 2단계: 카테고리별 맞춤형 분석
    const analysisStream = await analyzeMedicalDocumentByCategory(
      file.buffer,
      file.mimetype,
      classificationResult.category,
      extractedContent
    );

    let analysisResult = '';

    // 스트리밍 응답 처리
    for await (const chunk of analysisStream) {
      if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta) {
        const content = chunk.choices[0].delta.content;
        if (content) {
          analysisResult += content;
          
          res.write(`data: ${JSON.stringify({
            type: 'analysis_chunk',
            content: content
          })}\n\n`);
        }
      }
    }

    res.write(`data: ${JSON.stringify({
      type: 'progress',
      message: '분석 완료, 요약을 생성하고 있습니다...',
      progress: 90
    })}\n\n`);

    // 3단계: 카테고리별 요약 생성
    const summaryText = await generateCategorySummary(analysisResult, classificationResult.category);

    res.write(`data: ${JSON.stringify({
      type: 'complete',
      data: {
        analysis: analysisResult,
        summary: summaryText,
        classification: classificationResult,
        categoryInfo,
        fileName: file.originalname,
        analyzedAt: new Date().toISOString()
      }
    })}\n\n`);

    res.write(`data: ${JSON.stringify({
      type: 'progress',
      message: '모든 분석이 완료되었습니다.',
      progress: 100
    })}\n\n`);

  } catch (error) {
    console.error('카테고리별 분석 실패:', error);
    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: error.message || '분석 중 오류가 발생했습니다.'
    })}\n\n`);
  }

  res.end();
});

/**
 * 특정 카테고리의 상세 정보 조회
 * GET /api/medical/categories/:categoryCode
 */
router.get('/categories/:categoryCode', (req, res) => {
  try {
    const { categoryCode } = req.params;
    const categoryInfo = getCategoryInfo(categoryCode);
    
    if (categoryInfo.name === '기타' && categoryCode !== 'other') {
      return res.status(404).json({
        success: false,
        error: '존재하지 않는 카테고리입니다.'
      });
    }
    
    res.json({
      success: true,
      message: '카테고리 정보를 조회했습니다.',
      data: {
        code: categoryCode,
        ...categoryInfo,
        supportedFormats: ['PDF', 'JPG', 'PNG'],
        analysisFeatures: [
          '카테고리별 맞춤형 분석',
          '구조화된 데이터 추출',
          '전문적인 의학 정보 제공',
          '근거 기반 추천사항'
        ]
      }
    });
    
  } catch (error) {
    console.error('카테고리 정보 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '카테고리 정보 조회에 실패했습니다.'
    });
  }
});

/**
 * 사용자별 카테고리 통계 조회
 * GET /api/medical/category-stats
 */
router.get('/category-stats', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 사용자의 의료 기록에서 카테고리별 통계 조회
    const { data: records, error } = await supabase
      .from('medical_records')
      .select('document_category, created_at')
      .eq('user_id', userId);

    if (error) throw error;

    // 카테고리별 통계 계산
    const categoryStats = {};
    records.forEach(record => {
      const category = record.document_category || 'other';
      if (!categoryStats[category]) {
        categoryStats[category] = {
          count: 0,
          latestDate: null
        };
      }
      categoryStats[category].count++;
      
      if (!categoryStats[category].latestDate || 
          record.created_at > categoryStats[category].latestDate) {
        categoryStats[category].latestDate = record.created_at;
      }
    });

    // 카테고리 정보와 함께 반환
    const statsWithInfo = Object.entries(categoryStats).map(([code, stats]) => ({
      category: code,
      categoryInfo: getCategoryInfo(code),
      ...stats
    }));

    res.json({
      success: true,
      message: '카테고리별 통계를 조회했습니다.',
      data: {
        totalRecords: records.length,
        categoryStats: statsWithInfo,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('카테고리 통계 조회 실패:', error);
    res.status(500).json({
      success: false,
      error: '카테고리 통계 조회에 실패했습니다.'
    });
  }
});

module.exports = router; 