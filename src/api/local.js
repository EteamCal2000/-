// Supabase 키가 없을 때 쓰는 로컬 데모 백엔드.
// 같은 브라우저의 탭끼리만 공유되며, 규칙은 supabase/schema.sql 과 동일합니다.
import { CONFLICT_WINDOW_MIN, myDebt } from '../lib/core.js'

const KEY = 'gachika-local-db-v1'
let chan = null
try { chan = new BroadcastChannel('gachika') } catch {}

function seed() {
  const now = Date.now()
  const mk = (host, name, origin, dest, mins, cap, lug, note, extra) => {
    const id = crypto.randomUUID()
    const at = new Date(now + mins * 60000).toISOString()
    const members = [{ pod_id: id, user_id: host, nickname: name, luggage: 0, paid: false, joined_at: new Date(now - 600000).toISOString() }]
    for (let i = 1; i <= extra; i++) members.push({ pod_id: id, user_id: `${host}-m${i}`, nickname: `동승자${i}`, luggage: 0, paid: false, joined_at: new Date(now - 500000 + i).toISOString() })
    return { id, host_id: host, host_name: name, origin, dest, depart_at: at, capacity: cap, max_luggage: lug, note, fare: null, status: 'open', created_at: new Date(now - 600000).toISOString(), members, messages: [] }
  }
  return {
    pods: [
      mk('seed-1', '새내기', '한동대 택시정류장', '포항역', 90, 4, 2, 'KTX 타요', 1),
      mk('seed-2', '복학생', '한동대 택시정류장', '포항시외버스터미널', 150, 4, 2, '', 2),
      mk('seed-3', '도서관러', '포항역', '한동대', 200, 4, 3, '도착 기차 늦으면 채팅 주세요', 0),
      mk('seed-4', '야식러', '그할마(GS)', '유야', 40, 4, 1, '중간하차 가능', 3),
      mk('seed-5', '느헴주민', '한동대 택시정류장', '양덕(다이소)', 300, 3, 1, '', 0),
    ],
    msgId: 1,
  }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  const db = seed()
  save(db, false)
  return db
}
function save(db, notify = true) {
  try { localStorage.setItem(KEY, JSON.stringify(db)) } catch {}
  if (notify) { chan?.postMessage('changed'); listeners.forEach((l) => l()) }
}
const listeners = new Set()
chan && (chan.onmessage = () => listeners.forEach((l) => l()))

const delay = () => new Promise((r) => setTimeout(r, 120 + Math.random() * 180)) // 네트워크 지연 흉내
const clone = (x) => JSON.parse(JSON.stringify(x))

function conflicting(db, userId, at, except) {
  const t = new Date(at).getTime()
  return db.pods.find((p) =>
    p.id !== except && p.status === 'open' && p.fare == null &&
    p.members.some((m) => m.user_id === userId) &&
    Math.abs(new Date(p.depart_at).getTime() - t) < CONFLICT_WINDOW_MIN * 60000)
}

export function makeLocalApi() {
  return {
    mode: 'local',
    async listPods() {
      await delay()
      const since = Date.now() - 6 * 3600 * 1000
      return clone(load().pods.filter((p) => new Date(p.depart_at).getTime() >= since)
        .sort((a, b) => a.depart_at.localeCompare(b.depart_at)))
    },
    async getPod(id) {
      await delay()
      return clone(load().pods.find((p) => p.id === id) || null)
    },
    async createPod(me, f) {
      await delay()
      const db = load()
      const debt = myDebt(db.pods, me)
      if (debt) return { ok: false, code: 'DEBT', debt }
      const c = conflicting(db, me.id, f.departAt, null)
      if (c) return { ok: false, code: 'DUPLICATE', conflict: c.id }
      if (f.luggage > f.maxLuggage) return { ok: false, code: 'LUGGAGE' }
      const id = crypto.randomUUID()
      db.pods.push({
        id, host_id: me.id, host_name: me.nickname, origin: f.origin, dest: f.dest, depart_at: f.departAt,
        capacity: f.capacity, max_luggage: f.maxLuggage, note: f.note || '', fare: null, status: 'open',
        created_at: new Date().toISOString(),
        members: [{ pod_id: id, user_id: me.id, nickname: me.nickname, luggage: f.luggage, paid: false, joined_at: new Date().toISOString() }],
        messages: [],
      })
      save(db)
      return { ok: true, code: 'CREATED', id }
    },
    async joinPod(me, podId, luggage) {
      await delay()
      const db = load()
      const p = db.pods.find((x) => x.id === podId)
      if (!p || p.status !== 'open') return { ok: false, code: 'CLOSED' }
      if (p.fare != null) return { ok: false, code: 'DEPARTED' }
      if (p.members.some((m) => m.user_id === me.id)) return { ok: true, code: 'ALREADY' }
      const debt = myDebt(db.pods, me)
      if (debt) return { ok: false, code: 'DEBT', debt }
      const c = conflicting(db, me.id, p.depart_at, podId)
      if (c) return { ok: false, code: 'DUPLICATE', conflict: c.id }
      if (p.members.length >= p.capacity) return { ok: false, code: 'FULL' }
      if (p.members.reduce((s, m) => s + m.luggage, 0) + luggage > p.max_luggage) return { ok: false, code: 'LUGGAGE' }
      p.members.push({ pod_id: podId, user_id: me.id, nickname: me.nickname, luggage, paid: false, joined_at: new Date().toISOString() })
      save(db)
      return { ok: true, code: 'JOINED', count: p.members.length }
    },
    async leavePod(me, podId) {
      await delay()
      const db = load()
      const p = db.pods.find((x) => x.id === podId)
      if (!p) return { ok: false, code: 'CLOSED' }
      if (p.fare != null) return { ok: false, code: 'DEPARTED' }
      if (p.host_id === me.id) p.status = 'cancelled'
      else p.members = p.members.filter((m) => m.user_id !== me.id)
      save(db)
      return { ok: true, code: 'LEFT' }
    },
    async setFare(me, podId, fare, noshow = []) {
      await delay()
      if (!fare || fare < 1000 || fare > 200000) return { ok: false, code: 'BAD_FARE' }
      const db = load()
      const p = db.pods.find((x) => x.id === podId)
      if (!p || p.host_id !== me.id || p.status !== 'open') return { ok: false, code: 'NOT_HOST' }
      p.fare = fare
      p.members.forEach((m) => {
        if (m.user_id === me.id) m.paid = true
        else if (noshow.includes(m.user_id)) { m.boarded = false; m.paid = true }
      })
      save(db)
      return { ok: true, code: 'FARE_SET' }
    },
    async markPaid(me, podId, paid) {
      await delay()
      const db = load()
      const m = db.pods.find((x) => x.id === podId)?.members.find((x) => x.user_id === me.id)
      if (!m) return { ok: false, code: 'NOT_MEMBER' }
      m.paid = paid
      save(db)
      return { ok: true, code: 'PAID' }
    },
    async sendMessage(me, podId, body) {
      await delay()
      const db = load()
      const p = db.pods.find((x) => x.id === podId)
      const m = p?.members.find((x) => x.user_id === me.id)
      if (!m) return { ok: false, code: 'NOT_MEMBER' }
      p.messages.push({ id: db.msgId++, pod_id: podId, user_id: me.id, nickname: m.nickname, body: body.trim().slice(0, 500), created_at: new Date().toISOString() })
      save(db)
      return { ok: true, code: 'SENT' }
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    reset() {
      try { localStorage.removeItem(KEY) } catch {}
      save(load())
    },
  }
}
