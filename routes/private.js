const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth, getUserId } = require('../lib/session');

// 로그인 여부 확인용 (화면에 공개/비공개 어느 쪽을 보여줄지 판단)
router.get('/me', async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) return res.status(401).json({ authenticated: false });
  const { data: user } = await supabase
    .from('users')
    .select('id, username, display_name')
    .eq('id', userId)
    .maybeSingle();
  if (!user) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, user });
});

// 로그인한 사람 자신의 비공개 항목만 반환. userId는 세션 쿠키에서만 가져오고
// 요청 본문/쿼리로 넘어온 다른 계정 id는 절대 신뢰하지 않는다. (T08-C40)
router.get('/notes', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('private_notes')
    .select('*')
    .eq('user_id', req.userId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: '서버 오류' });
  res.json({ notes: data });
});

router.get('/credentials', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('credentials')
    .select('id, nickname, device_type, created_at')
    .eq('user_id', req.userId)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: '서버 오류' });
  res.json({ credentials: data });
});

// 패스키 삭제. 소유자 본인 것만 지울 수 있다 (owner 조건 확인 후 삭제).
router.delete('/credentials/:id', requireAuth, async (req, res) => {
  const { data: owned } = await supabase
    .from('credentials')
    .select('id')
    .eq('id', req.params.id)
    .eq('user_id', req.userId)
    .maybeSingle();
  if (!owned) return res.status(404).json({ error: '해당 패스키를 찾을 수 없습니다.' });

  await supabase.from('credentials').delete().eq('id', req.params.id);
  res.json({ ok: true });
});

module.exports = router;
