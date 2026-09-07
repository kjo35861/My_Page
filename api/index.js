require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const authRoutes = require('../routes/auth');
const privateRoutes = require('../routes/private');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/private', privateRoutes);
app.get('/health', (req, res) => res.json({ ok: true }));

// Vercel: 이 파일 자체가 서버리스 함수의 핸들러 (Express 앱은 (req,res)=>{} 함수와 동일하게 동작)
module.exports = app;
