/**
 * 텍스트 포맷팅 유틸리티
 */

/**
 * 마크다운 스타일 텍스트를 HTML로 변환
 * @param {string} text - 변환할 텍스트
 * @returns {string} HTML 변환된 텍스트
 */
function formatTextToHtml(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let formattedText = text;
  
  // **텍스트** -> <strong>텍스트</strong>
  formattedText = formattedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // 줄바꿈을 <br> 태그로 변환
  formattedText = formattedText.replace(/\n/g, '<br>');
  
  return formattedText;
}

/**
 * 의료 분석 결과를 포맷팅
 * @param {string} analysisText - 분석 결과 텍스트
 * @returns {object} 포맷팅된 결과 객체
 */
function formatMedicalAnalysis(analysisText) {
  if (!analysisText) {
    return {
      html: '',
      text: analysisText
    };
  }

  const htmlContent = formatTextToHtml(analysisText);
  
  return {
    html: htmlContent,
    text: analysisText,
    formatted: true
  };
}

module.exports = {
  formatTextToHtml,
  formatMedicalAnalysis
}; 