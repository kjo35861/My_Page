// Relying Party 설정. 배포 도메인이 바뀌면 RP_ID / ORIGIN 환경변수만 바꾸면 됩니다.
const RP_NAME = process.env.RP_NAME || 'My Page';
const RP_ID = process.env.RP_ID || 'localhost';
const ORIGIN = process.env.ORIGIN || 'http://localhost:3000';

module.exports = { RP_NAME, RP_ID, ORIGIN };
