import { useMemo, useState } from 'react'
import { api } from '../api/index.js'
import { useLive, go } from '../App.jsx'
import { PLACES, podState, STATE_LABEL, fmtDate, fmtTime, myDebt } from '../lib/core.js'
import { DebtNotice } from './PodView.jsx'
import Seats from './Seats.jsx'

const DAYS = [
  { k: 'all', label: '전체' },
  { k: 'today', label: '오늘' },
  { k: 'tomorrow', label: '내일' },
]

export default function ListView({ me }) {
  const { data: pods, error } = useLive(() => api.listPods(), [])
  const [origin, setOrigin] = useState('')
  const [dest, setDest] = useState('')
  const [day, setDay] = useState('all')
  const [onlyOpen, setOnlyOpen] = useState(true)

  const mine = useMemo(() => (pods || []).filter((p) =>
    p.members.some((m) => m.user_id === me.id) && ['open', 'full', 'departed'].includes(podState(p))), [pods, me.id])

  const shown = useMemo(() => {
    const today = new Date()
    const tmr = new Date(); tmr.setDate(today.getDate() + 1)
    return (pods || []).filter((p) => {
      const s = podState(p)
      if (s === 'cancelled' || s === 'expired') return false
      if (onlyOpen && s !== 'open') return false
      if (origin && p.origin !== origin) return false
      if (dest && p.dest !== dest) return false
      const d = new Date(p.depart_at).toDateString()
      if (day === 'today' && d !== today.toDateString()) return false
      if (day === 'tomorrow' && d !== tmr.toDateString()) return false
      return true
    })
  }, [pods, origin, dest, day, onlyOpen])

  const debt = myDebt(pods, me)

  return (
    <div className="page">
      {debt && <div className="debt-top"><DebtNotice debt={debt} /></div>}
      {mine.length > 0 && (
        <section className="mine">
          <h2 className="label">내가 확정된 팟</h2>
          {mine.map((p) => <PodCard key={p.id} pod={p} me={me} />)}
        </section>
      )}

      <section className="filters">
        <div className="route-pick">
          <select value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="출발지">
            <option value="">출발지 전체</option>
            {PLACES.map((x) => <option key={x}>{x}</option>)}
          </select>
          <button className="swap" aria-label="출발지와 도착지 바꾸기" onClick={() => { setOrigin(dest); setDest(origin) }}>⇄</button>
          <select value={dest} onChange={(e) => setDest(e.target.value)} aria-label="도착지">
            <option value="">도착지 전체</option>
            {PLACES.map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
        <div className="chips">
          {DAYS.map((d) => (
            <button key={d.k} className={`chip ${day === d.k ? 'on' : ''}`} onClick={() => setDay(d.k)}>{d.label}</button>
          ))}
          <label className="toggle">
            <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            자리 있는 팟만
          </label>
        </div>
      </section>

      {error && <p className="error">불러오기 실패: {error}</p>}
      {!pods && !error && <p className="muted center pad">불러오는 중…</p>}
      {pods && shown.length === 0 && (
        <div className="empty">
          <p>조건에 맞는 팟이 없어요.</p>
          <button className="btn primary" onClick={() => go('/new')}>내가 팟 만들기</button>
        </div>
      )}
      <div className="list">
        {shown.map((p) => <PodCard key={p.id} pod={p} me={me} />)}
      </div>

      <button className="fab" onClick={() => go('/new')}>＋ 팟 만들기</button>
      <p className="foot"><a href="#/about">이 앱은 어떻게 설계됐나요?</a></p>
    </div>
  )
}

export function PodCard({ pod, me }) {
  const s = podState(pod)
  const lug = pod.members.reduce((a, m) => a + m.luggage, 0)
  const isMine = pod.members.some((m) => m.user_id === me.id)
  const left = pod.capacity - pod.members.length
  return (
    <button className={`card state-${s}`} onClick={() => go(`/p/${pod.id}`)}>
      <div className="when">
        <span className="time">{fmtTime(pod.depart_at)}</span>
        <span className="date">{fmtDate(pod.depart_at)}</span>
      </div>
      <div className="body">
        <div className="route">
          <span>{pod.origin}</span><span className="arrow">→</span><span>{pod.dest}</span>
        </div>
        <div className="meta">
          <Seats n={pod.members.length} cap={pod.capacity} />
          <span>캐리어 {lug}/{pod.max_luggage}</span>
          {isMine && <span className="tag mine-tag">내 팟</span>}
        </div>
      </div>
      <div className={`badge b-${s}`}>
        {s === 'open' ? `${left}자리` : STATE_LABEL[s]}
      </div>
    </button>
  )
}
