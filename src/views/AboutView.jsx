import { go } from '../App.jsx'

const ROWS = [
  ['남은 자리를 제공한다', '인원 변화 후 5초 이내 반영', '모든 기기에 실시간 반영 (Supabase Realtime)'],
  ['합류를 확정한다', '10초 이내, 중복 확정 0건', '“바로 합류” 한 번에 확정 · DB 행 잠금으로 정원 초과 불가'],
  ['여러 팟 중복 신청 차단', '중복 확정 0건', '±60분 안의 다른 팟에 이미 확정돼 있으면 자동 차단'],
  ['팟 정보를 정형화한다', '필수 항목 누락 0%', '출발·도착·시각·정원·캐리어를 입력 폼으로 강제'],
  ['조건에 맞는 팟을 찾게 한다', '30초 이내, 3단계 이하', '출발/도착·날짜 필터, 자리 있는 팟만 보기'],
  ['탑승자를 연결한다', '전화번호 노출 0건', '번호 없이 닉네임 + 팟 전용 채팅'],
  ['요금을 정산한다', '오차 10원 이내, 1분 이내 요청', '요금 입력 → 1/n 자동 계산(10원 올림) → 송금 표시'],
  ['미사용자를 유입한다', '설치·가입 없이 3단계 이하', '톡방용 글·링크·QR 자동 생성 → 링크 → 닉네임 → 합류'],
]

export default function AboutView() {
  return (
    <div className="page about">
      <button className="back" onClick={() => go('/')}>← 목록</button>
      <h1>설계 요구사항 ↔ MVP 기능</h1>
      <p className="muted">공학설계입문 중간발표 · Concept B “웹 즉시매칭형”의 MVP입니다. 카톡 같이카 방을 대체하지 않고, 그 방에 붙여넣는 링크로 사람을 모읍니다.</p>
      <div className="req">
        {ROWS.map(([f, r, m]) => (
          <div key={f} className="req-row">
            <b>{f}</b>
            <span className="muted small">{r}</span>
            <span>{m}</span>
          </div>
        ))}
      </div>
      <h2 className="label">MVP 범위 밖 (정식 버전 과제)</h2>
      <ul className="plain">
        <li>학교 메일(handong.ac.kr) 인증 — 지금은 기기별 익명 ID</li>
        <li>실제 송금 연동(토스·카카오페이) — 지금은 완료 표시만</li>
        <li>노쇼 기록·신뢰도, 카풀(법적 검토 필요)</li>
      </ul>
    </div>
  )
}
