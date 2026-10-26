// 공통 규칙 — 로컬 데모와 Supabase SQL이 같은 규칙을 따릅니다.

export const PLACES = [
  '한동대 택시정류장',
  '한동대',
  '포항역',
  '포항시외버스터미널',
  '포항고속버스터미널',
  '양덕(다이소)',
  '그할마(GS)',
  '유야',
  '오흡',
  '비벤',
  '느헴',
  '현동',
  '궁물촌',
]

export const CONFLICT_WINDOW_MIN = 60 // 같은 사람이 ±60분 안의 팟 두 곳에 동시에 확정될 수 없음

export const ERR = {
  FULL: '방금 자리가 다 찼어요. 다른 팟을 확인해 주세요.',
  LUGGAGE: '캐리어 자리가 부족해요. 캐리어 개수를 줄이거나 다른 팟을 찾아주세요.',
  DUPLICATE: '비슷한 시간에 이미 확정된 팟이 있어요. 중복 확정은 막혀 있어요.',
  CLOSED: '취소된 팟이에요.',
  DEPARTED: '이미 출발해서 정산 중인 팟이에요.',
  NOT_HOST: '모집자만 할 수 있어요.',
  NOT_MEMBER: '팟 멤버만 할 수 있어요.',
  BAD_FARE: '요금을 1,000원 이상으로 입력해 주세요.',
}

// 정산: 동승자는 1/n을 10원 단위 올림, 나머지는 먼저 결제한 Host 몫
export function splitFare(fare, n) {
  if (!fare || !n) return { per: 0, host: 0 }
  if (n === 1) return { per: 0, host: fare }
  const per = Math.ceil(fare / n / 10) * 10
  return { per, host: fare - per * (n - 1) }
}

export function podState(pod) {
  if (pod.status === 'cancelled') return 'cancelled'
  if (pod.fare != null) return 'departed'
  if (pod.members.length >= pod.capacity) return 'full'
  if (new Date(pod.depart_at).getTime() < Date.now() - 20 * 60 * 1000) return 'expired'
  return 'open'
}

export const STATE_LABEL = {
  open: '모집중',
  full: '마감',
  departed: '출발·정산중',
  cancelled: '취소됨',
  expired: '시간 지남',
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']
export function fmtTime(iso) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
export function fmtDate(iso) {
  const d = new Date(iso)
  const today = new Date()
  const tmr = new Date(); tmr.setDate(today.getDate() + 1)
  const same = (a, b) => a.toDateString() === b.toDateString()
  const base = `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`
  if (same(d, today)) return `오늘 ${base}`
  if (same(d, tmr)) return `내일 ${base}`
  return base
}
export function won(n) {
  return `${Number(n || 0).toLocaleString('ko-KR')}원`
}

export function shareUrl(id) {
  return `${location.origin}${location.pathname}#/p/${id}`
}

export function shareText(pod) {
  const lug = pod.members.reduce((s, m) => s + m.luggage, 0)
  return [
    `[같이카] ${fmtDate(pod.depart_at)} ${fmtTime(pod.depart_at)}`,
    `${pod.origin} → ${pod.dest}`,
    `현재 ${pod.members.length}/${pod.capacity} · 캐리어 ${lug}/${pod.max_luggage}`,
    pod.note ? `메모: ${pod.note}` : null,
    `👉 가입 없이 바로 합류: ${shareUrl(pod.id)}`,
  ].filter(Boolean).join('\n')
}
