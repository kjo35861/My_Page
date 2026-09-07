# T08 — 패스키(WebAuthn)로 잠근 비공개 자리

1번 과제(`public/index.html`)는 그대로 두고, 아래에 패스키로만 열리는 비공개 자리를 추가했다.
공개키만 서버(Supabase)에 저장되고, 개인키는 등록한 기기 밖으로 나가지 않는다.

## 폴더 구조
```
public/index.html      1번 과제 소개 페이지 + 비공개 자리 UI/스크립트
server.js              Express 서버 진입점
routes/auth.js         등록 · 로그인 · 로그아웃 (WebAuthn)
routes/private.js      비공개 자료 조회 · 패스키 목록/삭제 (세션 필요)
lib/session.js         세션 쿠키(JWT) 발급/검증
lib/webauthn.js        RP_NAME / RP_ID / ORIGIN 설정
lib/supabase.js        Supabase 클라이언트
schema.sql             Supabase에 실행할 테이블 정의
docs/                  제출용 설명서 (인증 구현 설명서, 확인 방법, AI 3줄, 체크리스트)
```

## 1. Supabase 준비
1. https://supabase.com 에서 프로젝트를 하나 만든다 (이미 있는 프로젝트를 재사용해도 됨).
2. SQL Editor에 `schema.sql` 내용을 붙여넣고 실행한다.
3. Settings → API 에서 `Project URL`과 `service_role` 키(secret, anon 아님)를 복사해 둔다.

## 2. 로컬에서 실행해 보기
```bash
npm install
cp .env.example .env
# .env를 열어 SUPABASE_URL, SUPABASE_SERVICE_KEY, SESSION_SECRET 채우기
npm start
```
브라우저에서 `http://localhost:3000` 접속. **주의**: 패스키는 HTTPS 또는 `localhost`에서만 동작한다
(개발 중엔 `localhost`가 예외로 허용됨).

## 3. 실제 배포 (예: Render.com)
Render, Railway, Fly.io처럼 Node.js 프로세스를 계속 띄워 두는 곳이면 어디든 가능하다.

1. 이 저장소를 GitHub에 올린다 (`git push`).
2. Render에서 "New Web Service" → 이 저장소 연결 → Build Command `npm install`, Start Command `npm start`.
3. 환경변수에 `.env`와 같은 값을 넣되, 이번엔 실제 배포 도메인 기준으로 설정한다.
   - `RP_ID` = 배포 도메인 (예: `my-page.onrender.com`, `https://`나 포트는 빼고 도메인만)
   - `ORIGIN` = `https://my-page.onrender.com` (실제 배포 주소, 스킴 포함)
4. 배포가 끝나면 그 HTTPS 주소가 제출물의 "결과물 URL"이 된다.

## 4. 제출 전 직접 확인해야 하는 것
코드는 아래 동작을 하도록 작성되어 있지만, 패스키는 실제 브라우저 + 실제 기기(지문/얼굴/보안키)가
있어야 완료할 수 있는 절차라 AI가 대신 실행할 수 없다. 배포 후 반드시 본인이 직접:

- 계정 A를 만들고 패스키 1개 등록 → 로그아웃 → 다시 로그인되는지 확인
- 계정 A에 로그인한 상태에서 두 번째 패스키 추가 → 하나를 지우고 남은 것으로 로그인되는지 확인
- 계정 B를 새로 만들어, A의 비공개 항목이 B에게 보이지 않는지 확인
- 브라우저 개발자 도구 Network 탭에서 위 과정의 요청/응답을 캡처해
  `docs/T08_인증_구현_설명서.md`의 ④ 자리에 실제 캡처로 교체

이 과정을 마치면 과제에서 요구하는 "짧은 확인 방법 4줄"과 "완주 체크리스트" 항목이
실제 근거와 함께 채워진다.
