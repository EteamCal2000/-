// 가입 없이 쓰는 기기 단위 익명 ID (MVP). 정식 버전은 학교 메일(handong.ac.kr) 인증으로 대체.
const KEY = 'gachika-identity'

function safeGet() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}

export function getIdentity() {
  let id = safeGet()
  if (!id || !id.id) {
    id = { id: 'u-' + crypto.randomUUID(), nickname: '' }
    try { localStorage.setItem(KEY, JSON.stringify(id)) } catch {}
  }
  return id
}

export function setNickname(nickname) {
  const id = { ...getIdentity(), nickname: nickname.trim().slice(0, 12) }
  try { localStorage.setItem(KEY, JSON.stringify(id)) } catch {}
  return id
}
