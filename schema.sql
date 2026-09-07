-- T08: 패스키(WebAuthn) 인증을 위한 Supabase(Postgres) 스키마
-- Supabase 프로젝트의 SQL Editor에 그대로 붙여넣어 실행하세요.

create extension if not exists pgcrypto;

-- 계정 (아이디는 로그인/등록 시 입력하는 사용자명)
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- 패스키(자격증명) - 서버에는 공개키만 저장됨. 개인키는 절대 서버로 오지 않음.
create table if not exists credentials (
  id text primary key,                 -- 브라우저가 만든 credential ID (base64url)
  user_id uuid not null references users(id) on delete cascade,
  public_key text not null,            -- 공개키 (base64url) - 비밀번호가 아님
  counter bigint not null default 0,   -- 재사용(복제) 탐지를 위한 서명 카운터
  device_type text,
  backed_up boolean,
  transports text[],
  nickname text,                       -- 사람이 알아볼 수 있는 패스키 이름
  created_at timestamptz not null default now()
);

-- 등록/로그인용 일회용 질문(challenge). 사용 즉시 used=true로 표시해 재사용을 막음.
-- subject_id는 로그인/패스키추가 흐름에서는 실제 user.id이고, "신규 회원가입" 흐름에서는
-- 아직 users 테이블에 없는 후보 id다(계정은 검증에 성공한 뒤에만 만들어짐 -> 등록 취소 시
-- 아무 것도 저장되지 않게 하기 위해 users에 대한 외래키는 걸지 않는다).
create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null,
  pending_username text,
  pending_display_name text,
  challenge text not null,
  type text not null check (type in ('register', 'login')),
  used boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- 로그인 세션. JWT 대신 서버 DB에 남겨서, 로그아웃 시 즉시 폐기(삭제)할 수 있게 한다.
-- (JWT만 쓰면 로그아웃해도 예전 쿠키 값이 만료 전까지 계속 유효해 재사용될 수 있음)
create table if not exists sessions (
  token_hash text primary key,         -- 쿠키에 담긴 원문 토큰의 SHA-256 해시
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- 로그인 후에만 보이는 비공개 항목 (만들어 넣은 더미 데이터용)
create table if not exists private_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_credentials_user on credentials(user_id);
create index if not exists idx_challenges_subject_type on challenges(subject_id, type, used);
create index if not exists idx_private_notes_user on private_notes(user_id);
create index if not exists idx_sessions_user on sessions(user_id);

-- 참고: 서버는 SUPABASE_SERVICE_KEY(service_role)로 접속하므로 RLS를 켜 두어도
-- 백엔드 요청은 항상 통과합니다. 다만 실수로 anon key가 유출되어도 데이터가
-- 새 나가지 않도록 RLS는 켜 두고 별도 정책은 만들지 않는 것을 권장합니다.
alter table users enable row level security;
alter table credentials enable row level security;
alter table challenges enable row level security;
alter table private_notes enable row level security;
alter table sessions enable row level security;

-- 계정을 만든 뒤, 아래처럼 테스트용 비공개 항목을 넣어보세요.
-- (실제 연락처·신분증 번호 등 진짜 개인정보는 절대 넣지 않습니다)
--
-- insert into private_notes (user_id, title, content) values
--   ('<위에서 만든 user의 id>', '준비 중인 프로젝트 메모', '테스트로 만들어 넣은 내용입니다.'),
--   ('<위에서 만든 user의 id>', '지원하려는 곳 목록', 'A사, B사, C사 (테스트용)'),
--   ('<위에서 만든 user의 id>', '이번 주 회고', '테스트용 회고 데이터입니다.');
