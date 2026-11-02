import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api/index.js'
import { getIdentity, setNickname } from './lib/identity.js'
import ListView from './views/ListView.jsx'
import CreateView from './views/CreateView.jsx'
import PodView from './views/PodView.jsx'
import AboutView from './views/AboutView.jsx'

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/'
  const m = h.match(/^\/p\/([\w-]+)/)
  if (m) return { name: 'pod', id: m[1] }
  if (h.startsWith('/new')) return { name: 'new' }
  if (h.startsWith('/about')) return { name: 'about' }
  return { name: 'list' }
}

export const go = (path) => { location.hash = path }

const LOAD_TIMEOUT_MS = 10000 // 이 시간 안에 응답이 없으면 '불러오기 실패'로 안내

// 실시간 변경을 짧게 묶어서 다시 불러오는 훅
export function useLive(loader, deps) {
  const [data, setData] = useState(undefined)
  const [error, setError] = useState(null)
  const timer = useRef(null)
  const run = useCallback(() => {
    let settled = false
    const t = setTimeout(() => { if (!settled) setError('TIMEOUT') }, LOAD_TIMEOUT_MS)
    loader()
      .then((d) => { setData(d); setError(null) })
      .catch((e) => { console.error('[같이카] 불러오기 실패:', e); setError(e.message || 'ERROR') })
      .finally(() => { settled = true; clearTimeout(t) })
  }, deps) // eslint-disable-line
  useEffect(() => {
    run()
    const off = api.subscribe(() => {
      clearTimeout(timer.current)
      timer.current = setTimeout(run, 120)
    })
    const iv = setInterval(run, 30000) // 시간 경과 상태 갱신용
    return () => { off(); clearInterval(iv); clearTimeout(timer.current) }
  }, [run])
  // 다시 시도: 오류 표시를 지우고 '불러오는 중'으로 돌아간 뒤 재요청
  const reload = useCallback(() => { setError(null); run() }, [run])
  return { data, error, reload }
}

// 실시간 연결 상태 (live 모드에서만 의미 있음): 'connecting' | 'connected' | 'disconnected'
// 끊김은 1.5초 이상 이어질 때만 표시해서 순간적인 재연결로 화면이 깜빡이지 않게 한다.
function useConnection() {
  const [status, setStatus] = useState(api.status ? api.status() : 'connected')
  const [shownOff, setShownOff] = useState(false)
  useEffect(() => (api.onStatus ? api.onStatus(setStatus) : undefined), [])
  useEffect(() => {
    if (status !== 'disconnected') { setShownOff(false); return }
    const t = setTimeout(() => setShownOff(true), 1500)
    return () => clearTimeout(t)
  }, [status])
  return { status, disconnected: api.mode === 'live' && shownOff }
}

// 불러오기 실패: 기술적 오류 대신 사용자가 할 수 있는 행동을 안내
export function LoadError({ what, onRetry, compact }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="load-error" role="alert">
      <h3>{what} 불러오지 못했어요</h3>
      {!compact && <p>인터넷 연결을 확인한 뒤 다시 시도해 주세요. 계속 안 되면 잠시 후 다시 열어 주세요.</p>}
      {compact && <p>지금 보이는 정보는 최신이 아닐 수 있어요.</p>}
      <button className="btn solid" disabled={busy} onClick={() => { setBusy(true); onRetry(); setTimeout(() => setBusy(false), 1200) }}>
        {busy ? '다시 불러오는 중…' : '다시 시도'}
      </button>
    </div>
  )
}

export default function App() {
  const [route, setRoute] = useState(parseHash())
  const [me, setMe] = useState(getIdentity())
  const [toast, setToast] = useState(null)
  const [askName, setAskName] = useState(null) // 닉네임 입력 후 이어서 실행할 콜백
  const toastTimer = useRef(null)

  useEffect(() => {
    const on = () => { setRoute(parseHash()); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const notify = useCallback((msg, kind = 'info') => {
    clearTimeout(toastTimer.current)
    setToast({ msg, kind })
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  // 닉네임이 필요할 때만 묻는다 (가입 없음)
  const requireName = useCallback((then) => {
    const cur = getIdentity()
    if (cur.nickname) return then(cur)
    setAskName(() => then)
  }, [])

  const ctx = { me, notify, requireName }
  const conn = useConnection()
  const modeLabel = api.mode !== 'live' ? '로컬 데모'
    : conn.disconnected ? '연결 끊김' : conn.status === 'connected' ? '실시간' : '연결 중'
  const modeClass = api.mode !== 'live' ? '' : conn.disconnected ? 'disconnected' : conn.status

  return (
    <div className="shell">
      <header className="topbar">
        <button className="brand" onClick={() => go('/')} aria-label="홈">
          <span className="logo">같이<b>카</b></span>
        </button>
        <span className={`mode ${api.mode} ${modeClass}`} title={api.mode === 'live' ? '모든 기기와 실시간 공유 상태' : '이 브라우저에서만 저장되는 데모 모드'}>
          <i />{modeLabel}
        </span>
        <button className="who" onClick={() => setAskName(() => () => {})}>
          {me.nickname ? me.nickname : '닉네임 설정'}
        </button>
      </header>

      <main>
        {conn.disconnected && (
          <div className="conn-banner" role="status" aria-live="polite">
            <div className="grow">
              <b>실시간 연결이 끊겼어요</b>
              빈자리 표시가 늦을 수 있어요. 자동으로 다시 연결하는 중이에요.
            </div>
            <button className="btn" onClick={() => location.reload()}>새로고침</button>
          </div>
        )}
        {route.name === 'list' && <ListView {...ctx} />}
        {route.name === 'new' && <CreateView {...ctx} />}
        {route.name === 'pod' && <PodView key={route.id} id={route.id} {...ctx} />}
        {route.name === 'about' && <AboutView />}
      </main>

      {toast && <div className={`toast ${toast.kind}`} role="status">{toast.msg}</div>}

      {askName && (
        <NameSheet
          initial={me.nickname}
          onCancel={() => setAskName(null)}
          onSave={(name) => {
            const id = setNickname(name)
            setMe(id)
            const then = askName
            setAskName(null)
            then(id)
          }}
        />
      )}
    </div>
  )
}

function NameSheet({ initial, onSave, onCancel }) {
  const [v, setV] = useState(initial || '')
  return (
    <div className="sheet-bg" onClick={onCancel}>
      <form className="sheet" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (v.trim()) onSave(v) }}>
        <h3>닉네임만 정하면 끝</h3>
        <p className="muted">설치·가입·전화번호 없이 이용해요. 동승자에게는 닉네임만 보여요.</p>
        <input autoFocus maxLength={12} placeholder="예: 로뎀관 칼빈" value={v} onChange={(e) => setV(e.target.value)} />
        <div className="row gap">
          <button type="button" className="btn ghost" onClick={onCancel}>취소</button>
          <button className="btn primary grow" disabled={!v.trim()}>확인</button>
        </div>
      </form>
    </div>
  )
}
