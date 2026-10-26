import { useMemo, useState } from 'react'
import { api } from '../api/index.js'
import { useLive, go } from '../App.jsx'
import { PLACES, ERR, podState } from '../lib/core.js'
import { PodCard } from './ListView.jsx'

function localInputValue(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function defaultTime() {
  const d = new Date(Date.now() + 60 * 60000)
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0)
  return localInputValue(d)
}

export default function CreateView({ me, notify, requireName }) {
  const [f, setF] = useState({
    origin: '한동대 택시정류장', dest: '포항역', at: defaultTime(),
    capacity: 4, maxLuggage: 2, luggage: 0, note: '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'number' || typeof f[k] === 'number' ? Number(e.target.value) : e.target.value })
  const { data: pods } = useLive(() => api.listPods(), [])

  // 비슷한 팟 먼저 보여주기: 같은 경로 ±30분 + 자리 있음 → 팟이 쪼개지는 것(재게시 문제)을 줄임
  const similar = useMemo(() => {
    const t = new Date(f.at).getTime()
    return (pods || []).filter((p) => p.origin === f.origin && p.dest === f.dest && podState(p) === 'open' &&
      Math.abs(new Date(p.depart_at).getTime() - t) <= 30 * 60000)
  }, [pods, f.origin, f.dest, f.at])

  const submit = (e) => {
    e.preventDefault()
    if (f.origin === f.dest) return notify('출발지와 도착지가 같아요.', 'warn')
    if (new Date(f.at).getTime() < Date.now() - 5 * 60000) return notify('이미 지난 시각이에요.', 'warn')
    requireName(async (who) => {
      setBusy(true)
      try {
        const r = await api.createPod(who, { ...f, departAt: new Date(f.at).toISOString() })
        if (!r.ok) {
          notify(ERR[r.code] || r.code, 'warn')
          if (r.conflict) go(`/p/${r.conflict}`)
          if (r.debt) go(`/p/${r.debt.pod}`)
          return
        }
        go(`/p/${r.id}?new=1`)
      } catch (err) {
        notify('오류: ' + err.message, 'warn')
      } finally { setBusy(false) }
    })
  }

  return (
    <form className="page form" onSubmit={submit}>
      <h1>팟 만들기</h1>

      <div className="field-row">
        <label className="field">출발
          <select value={f.origin} onChange={set('origin')}>{PLACES.map((x) => <option key={x}>{x}</option>)}</select>
        </label>
        <button type="button" className="swap" aria-label="바꾸기" onClick={() => setF({ ...f, origin: f.dest, dest: f.origin })}>⇄</button>
        <label className="field">도착
          <select value={f.dest} onChange={set('dest')}>{PLACES.map((x) => <option key={x}>{x}</option>)}</select>
        </label>
      </div>

      <label className="field">탑승 시각
        <input type="datetime-local" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} required />
        <small>기차·버스 시각이 아니라, 택시 타는 곳에 모일 예상 시각이에요.</small>
      </label>

      <div className="field">정원 (나 포함)
        <div className="seg">
          {[2, 3, 4].map((n) => (
            <button type="button" key={n} className={f.capacity === n ? 'on' : ''} onClick={() => setF({ ...f, capacity: n })}>{n}명</button>
          ))}
        </div>
      </div>

      <div className="field-row">
        <div className="field">받을 수 있는 캐리어 (총)
          <div className="seg">
            {[0, 1, 2, 3].map((n) => (
              <button type="button" key={n} className={f.maxLuggage === n ? 'on' : ''}
                onClick={() => setF({ ...f, maxLuggage: n, luggage: Math.min(f.luggage, n) })}>{n}</button>
            ))}
          </div>
        </div>
        <div className="field">내 캐리어
          <div className="seg">
            {[0, 1, 2].map((n) => (
              <button type="button" key={n} disabled={n > f.maxLuggage} className={f.luggage === n ? 'on' : ''} onClick={() => setF({ ...f, luggage: n })}>{n}</button>
            ))}
          </div>
        </div>
      </div>
      <small className="muted">캐리어가 다 차면 캐리어 있는 사람의 합류는 자동으로 막혀요. (‘캐리어 마감’ 자동화)</small>

      <label className="field">메모 (선택)
        <input maxLength={60} placeholder="예: 중간하차 가능, KTX 타요" value={f.note} onChange={set('note')} />
      </label>

      {similar.length > 0 && (
        <div className="similar">
          <p><b>잠깐!</b> 비슷한 팟이 이미 있어요. 새로 만들기보다 합류하면 더 빨리 채워져요.</p>
          {similar.map((p) => <PodCard key={p.id} pod={p} me={me} />)}
        </div>
      )}

      <div className="sticky-actions">
        <button type="button" className="btn ghost" onClick={() => history.back()}>취소</button>
        <button className="btn primary grow" disabled={busy}>{busy ? '만드는 중…' : '팟 올리기'}</button>
      </div>
    </form>
  )
}
