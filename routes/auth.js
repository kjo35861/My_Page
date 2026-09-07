const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const supabase = require('../lib/supabase');
const { RP_NAME, RP_ID, ORIGIN } = require('../lib/webauthn');
const { issueSession, clearSession, getUserId } = require('../lib/session');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const { isoUint8Array, isoBase64URL } = require('@simplewebauthn/server/helpers');

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5분 안에 완료하지 않으면 만료

async function saveChallenge({ subjectId, challenge, type, pendingUsername, pendingDisplayName }) {
  const expires_at = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
  const { error } = await supabase.from('challenges').insert({
    subject_id: subjectId,
    challenge,
    type,
    pending_username: pendingUsername || null,
    pending_display_name: pendingDisplayName || null,
    expires_at,
  });
  if (error) throw error;
}

// 아직 쓰지 않았고 만료되지 않은 challenge를 꺼내 즉시 used=true로 표시한다.
// 같은 challenge로 두 번 요청하면 두 번째부터는 여기서 null이 나와 거절된다. (T08-C31)
async function consumeChallenge({ subjectId, type }) {
  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('subject_id', subjectId)
    .eq('type', type)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) return null;
  const row = data[0];
  await supabase.from('challenges').update({ used: true }).eq('id', row.id);
  return row;
}

/**
 * 1) 회원가입 / 패스키 추가 - 옵션 발급
 *
 *    새 아이디라면 이 시점에는 아직 users 테이블에 아무것도 만들지 않는다.
 *    (여기서 바로 계정을 만들면, 브라우저의 지문/PIN 창에서 사용자가 취소했을 때도
 *    서버에 빈 계정이 남아 "등록 취소 시 아무것도 저장되지 않아야 한다"는
 *    조건을 어기게 된다.) 대신 임시 후보 id만 만들어 challenge에 함께 저장해두고,
 *    실제 계정 생성은 register/verify에서 서명 검증에 통과한 뒤에만 한다.
 *
 *    이미 있는 아이디라면, 반드시 "그 계정으로 로그인된 상태"에서만
 *    두 번째 패스키 추가를 허용한다.
 */
router.post('/register/options', async (req, res) => {
  try {
    const { username, displayName } = req.body || {};
    if (!username || !username.trim()) {
      return res.status(400).json({ error: '아이디를 입력하세요.' });
    }
    const trimmedUsername = username.trim();

    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('username', trimmedUsername)
      .maybeSingle();

    let subjectId;
    let userNameForOptions = trimmedUsername;
    let displayNameForOptions = (displayName || trimmedUsername).trim();
    let pendingUsername = null;
    let pendingDisplayName = null;
    let existingCreds = [];

    if (existingUser) {
      const loggedInUserId = await getUserId(req);
      if (!loggedInUserId || loggedInUserId !== existingUser.id) {
        return res.status(403).json({ error: '이미 존재하는 계정입니다. 그 계정으로 로그인한 뒤 패스키를 추가하세요.' });
      }
      subjectId = existingUser.id;
      userNameForOptions = existingUser.username;
      displayNameForOptions = existingUser.display_name;
      const { data: creds } = await supabase
        .from('credentials')
        .select('id, transports')
        .eq('user_id', existingUser.id);
      existingCreds = creds || [];
    } else {
      // 아직 계정 없음 - 후보 id만 발급 (users 테이블에는 아직 아무것도 쓰지 않음)
      subjectId = crypto.randomUUID();
      pendingUsername = trimmedUsername;
      pendingDisplayName = displayNameForOptions;
    }

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: isoUint8Array.fromUTF8String(subjectId),
      userName: userNameForOptions,
      userDisplayName: displayNameForOptions,
      attestationType: 'none',
      excludeCredentials: existingCreds.map((c) => ({
        id: c.id,
        transports: c.transports || undefined,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    await saveChallenge({
      subjectId,
      challenge: options.challenge,
      type: 'register',
      pendingUsername,
      pendingDisplayName,
    });

    res.json({ options, userId: subjectId });
  } catch (e) {
    console.error('[register/options] 실패:', e);
    res.status(500).json({ error: '서버 오류로 등록 옵션을 만들지 못했습니다.' });
  }
});

// 2) 회원가입 / 패스키 추가 - 서명을 먼저 검증하고, 통과했을 때만 계정/패스키를 저장한다.
router.post('/register/verify', async (req, res) => {
  try {
    const { userId: subjectId, credential, nickname } = req.body || {};
    if (!subjectId || !credential) return res.status(400).json({ error: '잘못된 요청입니다.' });

    const challengeRow = await consumeChallenge({ subjectId, type: 'register' });
    if (!challengeRow) {
      return res.status(400).json({ error: '등록 요청이 만료되었거나 이미 사용된 질문입니다.' });
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: credential,
        expectedChallenge: challengeRow.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: false, // authenticatorSelection에서 'preferred'로 요청했으므로 검증도 필수로 강제하지 않음
      });
    } catch (e) {
      // 서명 검증 실패 - 이 시점까지 계정/패스키를 하나도 만들지 않았으므로 그대로 아무것도 남지 않는다.
      return res.status(400).json({ error: '등록 검증 실패: ' + e.message });
    }

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: '등록 검증에 실패했습니다.' });
    }

    // 서명 검증을 통과한 뒤에야 계정을 실제로 만든다 (신규 가입인 경우).
    let userId = subjectId;
    if (challengeRow.pending_username) {
      const { data: newUser, error: userInsertError } = await supabase
        .from('users')
        .insert({
          id: subjectId,
          username: challengeRow.pending_username,
          display_name: challengeRow.pending_display_name || challengeRow.pending_username,
        })
        .select()
        .single();
      if (userInsertError) {
        console.error('[register/verify] 계정 생성 실패:', userInsertError);
        return res.status(400).json({ error: '계정 생성에 실패했습니다. (이미 사용 중인 아이디일 수 있음)' });
      }
      userId = newUser.id;
    }

    const { credential: cred, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    // 서버에는 공개키만 저장한다. 개인키는 애초에 요청 본문에 들어 있지 않다.
    const { error: credError } = await supabase.from('credentials').insert({
      id: cred.id,
      user_id: userId,
      public_key: isoBase64URL.fromBuffer(cred.publicKey),
      counter: cred.counter,
      device_type: credentialDeviceType,
      backed_up: credentialBackedUp,
      transports: (credential.response && credential.response.transports) || [],
      nickname: (nickname && nickname.trim()) || '이름 없는 패스키',
    });
    if (credError) {
      console.error('[register/verify] 패스키 저장 실패:', credError);
      return res.status(400).json({ error: '이미 등록된 패스키입니다.' });
    }

    await issueSession(res, userId);
    res.json({ verified: true });
  } catch (e) {
    console.error('[register/verify] 실패:', e);
    res.status(500).json({ error: '서버 오류로 등록을 완료하지 못했습니다.' });
  }
});

// 3) 로그인 - 옵션 발급 (매번 새 challenge)
router.post('/login/options', async (req, res) => {
  try {
    const { username } = req.body || {};
    if (!username || !username.trim()) return res.status(400).json({ error: '아이디를 입력하세요.' });

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('username', username.trim())
      .maybeSingle();
    if (!user) return res.status(404).json({ error: '존재하지 않는 계정입니다.' });

    const { data: creds } = await supabase
      .from('credentials')
      .select('id, transports')
      .eq('user_id', user.id);
    if (!creds || creds.length === 0) return res.status(404).json({ error: '등록된 패스키가 없습니다.' });

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'preferred',
      allowCredentials: creds.map((c) => ({ id: c.id, transports: c.transports || undefined })),
    });

    await saveChallenge({ subjectId: user.id, challenge: options.challenge, type: 'login' });

    res.json({ options, userId: user.id });
  } catch (e) {
    console.error('[login/options] 실패:', e);
    res.status(500).json({ error: '서버 오류로 로그인 옵션을 만들지 못했습니다.' });
  }
});

// 4) 로그인 - 서명 검증. 통과해야만 세션을 발급한다.
router.post('/login/verify', async (req, res) => {
  try {
    const { userId, credential } = req.body || {};
    if (!userId || !credential) return res.status(400).json({ error: '잘못된 요청입니다.' });

    const challengeRow = await consumeChallenge({ subjectId: userId, type: 'login' });
    if (!challengeRow) {
      return res.status(400).json({ error: '로그인 요청이 만료되었거나 이미 사용된 질문입니다.' });
    }

    const { data: cred } = await supabase
      .from('credentials')
      .select('*')
      .eq('id', credential.id)
      .eq('user_id', userId)
      .maybeSingle();
    // 다른 계정의 패스키(id)로 로그인하려 하면 여기서 걸린다 (T08-C37~38)
    if (!cred) return res.status(400).json({ error: '이 계정에 등록되지 않은 패스키입니다.' });

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: challengeRow.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        requireUserVerification: false, // 로그인 옵션에서도 userVerification: 'preferred'이므로 맞춰줌
        credential: {
          id: cred.id,
          publicKey: isoBase64URL.toBuffer(cred.public_key),
          counter: Number(cred.counter),
          transports: cred.transports || undefined,
        },
      });
    } catch (e) {
      return res.status(400).json({ error: '로그인 검증 실패: ' + e.message });
    }

    if (!verification.verified) return res.status(400).json({ error: '로그인 검증에 실패했습니다.' });

    await supabase
      .from('credentials')
      .update({ counter: verification.authenticationInfo.newCounter })
      .eq('id', cred.id);

    await issueSession(res, userId);
    res.json({ verified: true });
  } catch (e) {
    console.error('[login/verify] 실패:', e);
    res.status(500).json({ error: '서버 오류로 로그인을 완료하지 못했습니다.' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    await clearSession(req, res);
    res.json({ ok: true });
  } catch (e) {
    console.error('[logout] 실패:', e);
    res.status(500).json({ error: '서버 오류' });
  }
});

module.exports = router;
