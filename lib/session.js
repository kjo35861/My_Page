const crypto = require('crypto');
const supabase = require('./supabase');

const COOKIE_NAME = 'session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일
const IS_PROD = process.env.NODE_ENV === 'production';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// 로그인/등록 성공 시에만 호출된다. 사람을 알아보는 방법은 이 서버측 세션 레코드다.
// 쿠키에는 원문 토큰만 담고, DB에는 해시만 저장한다(DB가 유출돼도 쿠키 값을 못 만듦).
async function issueSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires_at = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const { error } = await supabase
    .from('sessions')
    .insert({ token_hash: hashToken(token), user_id: userId, expires_at });
  if (error) throw error;

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

// 로그아웃: 쿠키만 지우는 게 아니라 서버에 저장된 세션 레코드 자체를 삭제한다.
// 이렇게 해야 로그아웃 전에 복사해 둔 쿠키 값으로 다시 요청해도 거절된다. (T08-C33)
async function clearSession(req, res) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (token) {
    await supabase.from('sessions').delete().eq('token_hash', hashToken(token));
  }
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

async function getUserId(req) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return null;

  const { data } = await supabase
    .from('sessions')
    .select('user_id, expires_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle();

  if (!data) return null; // 존재하지 않음 = 위조되었거나 로그아웃으로 이미 폐기됨
  if (new Date(data.expires_at).getTime() < Date.now()) return null; // 만료

  return data.user_id;
}

async function requireAuth(req, res, next) {
  try {
    const userId = await getUserId(req);
    if (!userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    req.userId = userId;
    next();
  } catch (e) {
    console.error('[requireAuth] 세션 확인 실패:', e);
    res.status(500).json({ error: '서버 오류' });
  }
}

module.exports = { issueSession, clearSession, getUserId, requireAuth, COOKIE_NAME };
