const nodemailer = require('nodemailer');

/**
 * 이메일 전송 서비스
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.testAccount = null;
    this.isGmail = false;
    this.initializeTransporter();
  }

  async initializeTransporter() {
    try {
      // Gmail 설정이 있으면 Gmail 사용
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });
        this.isGmail = true;
        console.log('✅ Gmail SMTP 연결됨');
      } else {
        // 없으면 테스트 계정 생성
        this.testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: this.testAccount.user,
            pass: this.testAccount.pass
          }
        });
        this.isGmail = false;
        console.log('🧪 테스트 이메일 계정 생성됨:', this.testAccount.user);
        console.log('📧 전송된 이메일 확인: https://ethereal.email');
      }
    } catch (error) {
      console.error('이메일 서비스 초기화 실패:', error);
    }
  }

  /**
   * 이메일 전송
   * @param {Object} emailData - 이메일 데이터
   * @param {string} emailData.name - 사용자 이름
   * @param {string} emailData.email - 연락받을 이메일 주소
   * @param {string} emailData.content - 문의 내용
   * @returns {Promise<Object>} 전송 결과
   */
  async sendEmail({ name, email, content }) {
    try {
      // 트랜스포터가 없으면 초기화 대기
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      // 이메일 옵션 설정
      const fromAddress = this.isGmail ? process.env.EMAIL_USER : this.testAccount.user;
      const toAddress = this.isGmail ? 'xornjs1988@gmail.com' : 'xornjs1988@gmail.com'; // 테스트에서도 실제 주소 사용

      const mailOptions = {
        from: {
          name: `${name} (의료 AI API)`,
          address: fromAddress
        },
        to: toAddress,
        subject: `[의료 AI API] 개발자 문의 - ${name}`,
        text: this.createTextTemplate(name, email, content),
        replyTo: email // 답장 시 사용자 이메일로 회신
      };

      // 이메일 전송
      const result = await this.transporter.sendMail(mailOptions);
      
      // 테스트 계정인 경우 미리보기 URL 포함
      const response = {
        success: true,
        messageId: result.messageId,
        message: this.isGmail 
          ? '이메일이 성공적으로 전송되었습니다.' 
          : '테스트 이메일이 전송되었습니다. 아래 URL에서 확인하세요.'
      };

      if (!this.isGmail && result.messageId) {
        response.previewUrl = nodemailer.getTestMessageUrl(result);
        console.log('📧 이메일 미리보기 URL:', response.previewUrl);
      }

      return response;

    } catch (error) {
      console.error('이메일 전송 오류:', error);
      throw new Error(`이메일 전송 실패: ${error.message}`);
    }
  }

  /**
   * 텍스트 이메일 템플릿 생성
   * @param {string} name - 사용자 이름
   * @param {string} email - 연락받을 이메일 주소
   * @param {string} content - 문의 내용
   * @returns {string} 텍스트 템플릿
   */
  createTextTemplate(name, email, content) {
    return `=== 의료 AI API 개발자 문의 ===

사용자 이름: ${name}
연락처 이메일: ${email}
문의 시간: ${new Date().toLocaleString('ko-KR')}

--- 문의 내용 ---
${content}

--
이 메일은 의료 AI API 시스템에서 자동으로 발송되었습니다.`;
  }

  /**
   * 연결 테스트
   * @returns {Promise<boolean>} 연결 성공 여부
   */
  async verifyConnection() {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('이메일 연결 테스트 실패:', error);
      return false;
    }
  }
}

module.exports = new EmailService(); 