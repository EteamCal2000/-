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

// 실시간 변경을 짧게 묶어서 다시 불러오는 훅
export function useLive(loader, deps) {
  const [data, setData] = useState(undefined)
  const [error, setError] = useState(null)
  const timer = useRef(null)
  const run = useCallback(() => {
    loader().then((d) => { setData(d); setError(null) }).catch((e) => setError(e.message))
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
  return { data, error, reload: run }
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

  return (
    <div className="shell">
      <header className="topbar">
        <button className="brand" onClick={() => go('/')} aria-label="홈">
          <span className="logo">같이<b>카</b></span>
        </button>
        <span className={`mode ${api.mode}`} title={api.mode === 'live' ? '모든 기기와 실시간 공유 중' : '이 브라우저에서만 저장되는 데모 모드'}>
          <i />{api.mode === 'live' ? '실시간' : '로컬 데모'}
        </span>
        <button className="who" onClick={() => setAskName(() => () => {})}>
          {me.nickname ? me.nickname : '닉네임 설정'}
        </button>
      </header>

      <main>
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
