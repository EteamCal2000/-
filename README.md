# 같이카 — 한동대 택시 합승 MVP

공학설계입문 중간발표 · Concept B "웹 즉시매칭형" 프로토타입.

- 남은 자리 실시간 표시, **누르면 즉시 확정** (DB 행 잠금으로 정원 초과 0건)
- ±60분 안의 다른 팟과 **중복 확정 자동 차단**
- 캐리어 정원 자동 판정, 전화번호 없이 팟 전용 채팅
- 요금 입력 → 1/n 자동 정산(10원 올림)
- 톡방용 글·링크·QR 자동 생성 → 가입 없이 합류

## 실행
```
npm install
npm run dev
```
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`가 없으면 **로컬 데모 모드**(이 브라우저에서만 저장)로 동작합니다.

## 실시간 모드 (Supabase)
1. Supabase 프로젝트 → SQL Editor → `supabase/schema.sql` 전체 실행
2. Project Settings → API에서 Project URL, anon(publishable) key 복사
3. Vercel → Settings → Environment Variables에 위 두 값 등록 후 Redeploy

## MVP 한계
기기별 익명 ID(정식: 학교 메일 인증), 실제 송금 없음, 데이터는 anon key로 읽기 가능.
