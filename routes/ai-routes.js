const express = require('express');
const { askChatGPT, chatWithHistory, validateApiKey } = require('../services/openai-service');
const { optionalAuth, authenticateToken } = require('../utils/jwt-utils');
const { upload, validateFile, formatUploadError } = require('../utils/file-upload-utils');
const { checkIfMedicalRecord, analyzeMedicalRecord } = require('../services/medical-analysis-service');
const { formatTextToHtml, formatMedicalAnalysis } = require('../utils/text-formatter');

const router = express.Router();

/**
 * 진료 기록 업로드 및 분석 (SSE)
 * POST /api/medical/analyze
 */
router.post('/medical/analyze', upload.single('medicalFile'), async (req, res) => {
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

    // 분석 시작 알림
    res.write(`data: ${JSON.stringify({
      type: 'status',
      message: '파일 업로드 완료. 진료 기록 확인 중...'
    })}\n\n`);

    // 진료 기록인지 확인
    const isMedicalRecord = await checkIfMedicalRecord(req.file.buffer, req.file.mimetype);
    
    if (!isMedicalRecord) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: '진료 기록이 아닙니다. 진료 기록(처방전, 진단서, 검사 결과지 등)만 분석할 수 있습니다.'
      })}\n\n`);
      return res.end();
    }

    // 진료 기록 분석 시작
    res.write(`data: ${JSON.stringify({
      type: 'status',
      message: '진료 기록을 분석하고 있습니다...'
    })}\n\n`);

    // OpenAI 스트리밍 분석
    const stream = await analyzeMedicalRecord(req.file.buffer, req.file.mimetype);
    
    let accumulatedContent = '';
    let tokenCount = 0;
    const MAX_TOKENS = 4000;
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      
      if (content) {
        accumulatedContent += content;
        
        // 대략적인 토큰 카운트 (단어 수 기준)
        tokenCount += content.split(/\s+/).length;
        
        // 실시간으로 부분 응답 전송
        res.write(`data: ${JSON.stringify({
          type: 'chunk',
          content: content
        })}\n\n`);
        
        // 토큰 제한 체크를 더 관대하게 변경
        if (tokenCount >= MAX_TOKENS) {
          res.write(`data: ${JSON.stringify({
            type: 'info',
            message: `상세 분석이 ${MAX_TOKENS}개 토큰에 도달했습니다. 분석을 완료합니다.`
          })}\n\n`);
          break;
        }
      }
    }

    // JSON 파싱 시도
    try {
      // JSON 형태로 응답이 올 것으로 예상되므로 파싱 시도
      let parsedResult;
      try {
        parsedResult = JSON.parse(accumulatedContent);
      } catch (jsonError) {
        // JSON 파싱 실패 시 원본 텍스트로 처리
        console.log('JSON 파싱 실패, 원본 텍스트로 처리:', jsonError.message);
        parsedResult = null;
      }
      
      const formattedResult = formatMedicalAnalysis(accumulatedContent);
      
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        result: {
          analysis: accumulatedContent,               // 원본 텍스트 (JSON 문자열)
          analysisHtml: formattedResult.html,         // HTML 포맷팅된 텍스트
          parsedData: parsedResult,                   // 파싱된 JSON 객체 (성공 시)
          tokenCount: tokenCount,
          format: parsedResult ? 'json' : 'html'
        },
        message: tokenCount >= MAX_TOKENS 
          ? `상세 분석이 완료되었습니다. (${MAX_TOKENS}개 토큰)`
          : '진료 기록 분석이 완료되었습니다.'
      })}\n\n`);
      
    } catch (parseError) {
      console.error('분석 결과 처리 오류:', parseError);
      
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        result: {
          analysis: accumulatedContent,
          analysisHtml: formatTextToHtml(accumulatedContent),
          parsedData: null,
          tokenCount: tokenCount,
          error: '분석 결과 처리 중 오류가 발생했습니다.'
        },
        message: '분석은 완료되었으나 결과 처리 중 오류가 발생했습니다.'
      })}\n\n`);
    }

  } catch (error) {
    console.error('진료 기록 분석 중 오류:', error);
    
    let errorMessage = '진료 기록 분석 중 오류가 발생했습니다.';
    
    if (error.message) {
      errorMessage = formatUploadError(error);
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
 * 진료 기록 분석 지원 파일 형식 조회
 * GET /api/medical/supported-formats
 */
router.get('/medical/supported-formats', (req, res) => {
  res.json({
    supportedFormats: [
      {
        name: 'JPG',
        mimeType: 'image/jpeg',
        extensions: ['.jpg', '.jpeg']
      },
      {
        name: 'PNG', 
        mimeType: 'image/png',
        extensions: ['.png']
      },
      {
        name: 'PDF',
        mimeType: 'application/pdf',
        extensions: ['.pdf']
      }
    ],
    maxFileSize: '5MB',
    maxFileSizeBytes: 5 * 1024 * 1024,
    description: '진료 기록(처방전, 진단서, 검사 결과지 등)을 업로드하여 AI가 분석합니다.',
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