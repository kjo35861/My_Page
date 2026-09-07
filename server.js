require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('./routes/auth');
const privateRoutes = require('./routes/private');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/private', privateRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

// SPA 라우팅: 그 외 GET 요청은 index.html로 (선택 사항, 지금은 단일 페이지라 없어도 무방)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
