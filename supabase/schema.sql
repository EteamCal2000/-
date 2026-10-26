-- =============================================================
-- 같이카 MVP — Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다(데모 데이터는 매번 새로 만들어짐).
-- =============================================================

create extension if not exists pgcrypto;

-- ---------- 테이블 ----------
create table if not exists pods (
  id          uuid primary key default gen_random_uuid(),
  host_id     text not null,
  host_name   text not null,
  origin      text not null,
  dest        text not null,
  depart_at   timestamptz not null,           -- 택시 타는 곳에 모이는 예상 시각
  capacity    int  not null check (capacity between 2 and 4),
  max_luggage int  not null default 2 check (max_luggage between 0 and 4),
  note        text not null default '',
  fare        int,                             -- 탑승 후 Host가 입력한 총 요금
  status      text not null default 'open' check (status in ('open','cancelled')),
  created_at  timestamptz not null default now()
);

create table if not exists members (
  pod_id    uuid not null references pods(id) on delete cascade,
  user_id   text not null,
  nickname  text not null,
  luggage   int  not null default 0 check (luggage between 0 and 2),
  paid      boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (pod_id, user_id)
);

-- v2: 탑승 확인(노쇼) — 이미 만든 DB에도 컬럼 추가
alter table members add column if not exists boarded boolean not null default true;

create table if not exists messages (
  id         bigint generated always as identity primary key,
  pod_id     uuid not null references pods(id) on delete cascade,
  user_id    text not null,
  nickname   text not null,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists members_user_idx on members(user_id);
create index if not exists pods_depart_idx on pods(depart_at);
create index if not exists messages_pod_idx on messages(pod_id);

-- ---------- 보안: 읽기만 허용, 쓰기는 아래 함수로만 ----------
alter table pods     enable row level security;
alter table members  enable row level security;
alter table messages enable row level security;

drop policy if exists "read pods" on pods;
drop policy if exists "read members" on members;
drop policy if exists "read messages" on messages;
create policy "read pods"     on pods     for select using (true);
create policy "read members"  on members  for select using (true);
create policy "read messages" on messages for select using (true);

-- ---------- 공통: 같은 사람이 비슷한 시간(±60분)의 다른 팟에 이미 있는지 ----------
create or replace function _conflicting_pod(p_user text, p_at timestamptz, p_except uuid)
returns uuid language sql stable as $$
  select p.id from members m join pods p on p.id = m.pod_id
  where m.user_id = p_user
    and p.id <> coalesce(p_except, '00000000-0000-0000-0000-000000000000'::uuid)
    and p.status = 'open' and p.fare is null
    and abs(extract(epoch from (p.depart_at - p_at))) < 3600
  limit 1
$$;

-- ---------- 미정산 확인: 탑승했는데 송금 안 한 정산이 있으면 새 팟 참여 불가 ----------
create or replace function _unpaid(p_user text)
returns json language sql stable as $$
  select json_build_object('pod', p.id, 'amount',
           (ceil(p.fare::numeric / greatest((select count(*) from members b where b.pod_id = p.id and b.boarded), 1) / 10) * 10)::int,
           'host', p.host_name)
  from members m join pods p on p.id = m.pod_id
  where m.user_id = p_user and p.fare is not null and p.host_id <> p_user
    and m.boarded and not m.paid
  order by p.depart_at limit 1
$$;

-- ---------- 팟 만들기 (Host 자동 합류) ----------
create or replace function create_pod(
  p_user text, p_name text, p_origin text, p_dest text, p_at timestamptz,
  p_capacity int, p_max_luggage int, p_luggage int, p_note text)
returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_conflict uuid; v_debt json;
begin
  perform pg_advisory_xact_lock(hashtext(p_user));
  v_debt := _unpaid(p_user);
  if v_debt is not null then
    return json_build_object('ok', false, 'code', 'DEBT', 'debt', v_debt);
  end if;
  v_conflict := _conflicting_pod(p_user, p_at, null);
  if v_conflict is not null then
    return json_build_object('ok', false, 'code', 'DUPLICATE', 'conflict', v_conflict);
  end if;
  if p_luggage > p_max_luggage then
    return json_build_object('ok', false, 'code', 'LUGGAGE');
  end if;
  insert into pods(host_id, host_name, origin, dest, depart_at, capacity, max_luggage, note)
  values (p_user, p_name, p_origin, p_dest, p_at, p_capacity, p_max_luggage, coalesce(p_note, ''))
  returning id into v_id;
  insert into members(pod_id, user_id, nickname, luggage) values (v_id, p_user, p_name, p_luggage);
  return json_build_object('ok', true, 'code', 'CREATED', 'id', v_id);
end $$;

-- ---------- 합류: 행 잠금으로 동시 합류 시에도 정원 초과(중복 확정) 0건 ----------
create or replace function join_pod(p_pod uuid, p_user text, p_name text, p_luggage int)
returns json language plpgsql security definer set search_path = public as $$
declare v_pod pods; v_count int; v_lug int; v_conflict uuid; v_debt json;
begin
  perform pg_advisory_xact_lock(hashtext(p_user));          -- 같은 사람의 동시 신청 직렬화
  v_debt := _unpaid(p_user);
  if v_debt is not null then
    return json_build_object('ok', false, 'code', 'DEBT', 'debt', v_debt);
  end if;
  select * into v_pod from pods where id = p_pod for update; -- 같은 팟의 동시 합류 직렬화
  if not found or v_pod.status <> 'open' then
    return json_build_object('ok', false, 'code', 'CLOSED');
  end if;
  if v_pod.fare is not null then
    return json_build_object('ok', false, 'code', 'DEPARTED');
  end if;
  if exists (select 1 from members where pod_id = p_pod and user_id = p_user) then
    return json_build_object('ok', true, 'code', 'ALREADY');
  end if;
  v_conflict := _conflicting_pod(p_user, v_pod.depart_at, p_pod);
  if v_conflict is not null then
    return json_build_object('ok', false, 'code', 'DUPLICATE', 'conflict', v_conflict);
  end if;
  select count(*), coalesce(sum(luggage), 0) into v_count, v_lug from members where pod_id = p_pod;
  if v_count >= v_pod.capacity then
    return json_build_object('ok', false, 'code', 'FULL');
  end if;
  if v_lug + p_luggage > v_pod.max_luggage then
    return json_build_object('ok', false, 'code', 'LUGGAGE');
  end if;
  insert into members(pod_id, user_id, nickname, luggage) values (p_pod, p_user, p_name, p_luggage);
  return json_build_object('ok', true, 'code', 'JOINED', 'count', v_count + 1);
end $$;

-- ---------- 나가기 (Host가 나가면 팟 취소) ----------
create or replace function leave_pod(p_pod uuid, p_user text)
returns json language plpgsql security definer set search_path = public as $$
declare v_pod pods;
begin
  select * into v_pod from pods where id = p_pod for update;
  if not found then return json_build_object('ok', false, 'code', 'CLOSED'); end if;
  if v_pod.fare is not null then return json_build_object('ok', false, 'code', 'DEPARTED'); end if;
  if v_pod.host_id = p_user then
    update pods set status = 'cancelled' where id = p_pod;
  else
    delete from members where pod_id = p_pod and user_id = p_user;
  end if;
  return json_build_object('ok', true, 'code', 'LEFT');
end $$;

-- ---------- 정산: Host가 총 요금 + 실제 탑승하지 않은 사람(노쇼) 입력 ----------
drop function if exists set_fare(uuid, text, int);
create or replace function set_fare(p_pod uuid, p_user text, p_fare int, p_noshow text[] default '{}')
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_fare is null or p_fare < 1000 or p_fare > 200000 then
    return json_build_object('ok', false, 'code', 'BAD_FARE');
  end if;
  update pods set fare = p_fare where id = p_pod and host_id = p_user and status = 'open';
  if not found then return json_build_object('ok', false, 'code', 'NOT_HOST'); end if;
  update members set paid = true where pod_id = p_pod and user_id = p_user; -- Host는 이미 결제함
  update members set boarded = false, paid = true                            -- 노쇼는 정산에서 제외
   where pod_id = p_pod and user_id = any(coalesce(p_noshow, '{}')) and user_id <> p_user;
  return json_build_object('ok', true, 'code', 'FARE_SET');
end $$;

create or replace function mark_paid(p_pod uuid, p_user text, p_paid boolean)
returns json language plpgsql security definer set search_path = public as $$
begin
  update members set paid = p_paid where pod_id = p_pod and user_id = p_user;
  if not found then return json_build_object('ok', false, 'code', 'NOT_MEMBER'); end if;
  return json_build_object('ok', true, 'code', 'PAID');
end $$;

-- ---------- 채팅 (멤버만) ----------
create or replace function send_message(p_pod uuid, p_user text, p_body text)
returns json language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select nickname into v_name from members where pod_id = p_pod and user_id = p_user;
  if v_name is null then return json_build_object('ok', false, 'code', 'NOT_MEMBER'); end if;
  insert into messages(pod_id, user_id, nickname, body) values (p_pod, p_user, v_name, left(trim(p_body), 500));
  return json_build_object('ok', true, 'code', 'SENT');
end $$;

-- "Automatically expose new tables"를 껐어도 동작하도록 명시적으로 권한 부여 (읽기만)
grant usage on schema public to anon, authenticated;
grant select on pods, members, messages to anon, authenticated;
grant execute on function create_pod, join_pod, leave_pod, set_fare, mark_paid, send_message to anon, authenticated;

-- ---------- 실시간 반영 켜기 ----------
do $$ begin
  begin alter publication supabase_realtime add table pods;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table members;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table messages; exception when duplicate_object then null; end;
end $$;

-- ---------- 데모 데이터 (실제 같이카 방에 올라온 경로를 참고, 이름은 가명) ----------
delete from pods where host_id like 'seed-%';
with s(host, name, origin, dest, mins, cap, lug, note, extra) as (values
  ('seed-1', '새내기', '한동대 택시정류장', '포항역',            90, 4, 2, 'KTX 타요', 1),
  ('seed-2', '복학생', '한동대 택시정류장', '포항시외버스터미널', 150, 4, 2, '',         2),
  ('seed-3', '도서관러', '포항역',          '한동대',            200, 4, 3, '도착 기차 늦으면 채팅 주세요', 0),
  ('seed-4', '야식러', '그할마(GS)',        '유야',               40, 4, 1, '중간하차 가능', 3),
  ('seed-5', '느헴주민', '한동대 택시정류장', '양덕(다이소)',     300, 3, 1, '', 0)
), ins as (
  insert into pods(host_id, host_name, origin, dest, depart_at, capacity, max_luggage, note)
  select host, name, origin, dest, now() + make_interval(mins => mins), cap, lug, note from s
  returning id, host_id, host_name
)
insert into members(pod_id, user_id, nickname, luggage)
select id, host_id, host_name, 0 from ins
union all
select ins.id, ins.host_id || '-m' || g, '동승자' || g, 0
from ins join s on s.host = ins.host_id, generate_series(1, s.extra) g;
