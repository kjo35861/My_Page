// 로컬 개발 실행용. 실제 로직은 api/index.js에 있고(Vercel 서버리스 함수 겸용),
// 여기서는 그 Express 앱을 그대로 가져와 로컬 포트에서 계속 띄워두기만 한다.
const app = require('./api/index.js');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
