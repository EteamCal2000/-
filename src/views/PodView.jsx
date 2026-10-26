import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { api } from '../api/index.js'
import { useLive, go } from '../App.jsx'
import { ERR, podState, STATE_LABEL, fmtDate, fmtTime, won, splitFare, shareText, shareUrl } from '../lib/core.js'
import Seats from './Seats.jsx'

export default function PodView({ id, me, notify, requireName }) {
  const { data: pod, error, reload } = useLive(() => api.getPod(id), [id])
  const isNew = location.hash.includes('new=1')
  const [showShare, setShowShare] = useState(isNew)

  if (error) return <div className="page"><p className="error">불러오기 실패: {error}</p></div>
  if (pod === undefined) return <div className="page"><p className="muted center pad">불러오는 중…</p></div>
  if (!pod) return <div className="page"><p className="center pad">없는 팟이에요.</p><button className="btn" onClick={() => go('/')}>목록으로</button></div>

  const s = podState(pod)
  const myMember = pod.members.find((m) => m.user_id === me.id)
  const isHost = pod.host_id === me.id
  const lug = pod.members.reduce((a, m) => a + m.luggage, 0)

  return (
    <div className="page pod">
      <button className="back" onClick={() => go('/')}>← 목록</button>

      <section className={`hero state-${s}`}>
        <div className="hero-top">
          <span className="date">{fmtDate(pod.depart_at)}</span>
          <span className={`badge b-${s}`}>{STATE_LABEL[s]}</span>
        </div>
        <div className="hero-time">{fmtTime(pod.depart_at)}</div>
        <div className="hero-route">{pod.origin} <span className="arrow">→</span> {pod.dest}</div>
        {pod.note && <p className="note">“{pod.note}”</p>}
        <div className="hero-meta">
          <Seats n={pod.members.length} cap={pod.capacity} big />
          <span className="lug">캐리어 {lug}/{pod.max_luggage}</span>
        </div>
      </section>

      {isNew && isHost && (
        <div className="callout">
          <b>팟이 올라갔어요.</b> 아래 글을 복사해 기존 같이카 톡방에 붙여넣으세요.
          링크를 누른 사람은 <b>가입 없이</b> 바로 합류하고, 인원은 자동으로 갱신돼요.
        </div>
      )}

      <section className="block">
        <h2 className="label">확정된 탑승자</h2>
        <ul className="members">
          {pod.members.map((m) => (
            <li key={m.user_id} className={m.user_id === me.id ? 'me' : ''}>
              <span className="avatar">{m.nickname.slice(0, 1)}</span>
              <span className="nm">{m.nickname}{m.user_id === pod.host_id && <em> 모집자</em>}{m.user_id === me.id && <em className="you"> 나</em>}</span>
              <span className="muted">{m.luggage ? `캐리어 ${m.luggage}` : ''}</span>
              {pod.fare != null && <span className={`paid ${m.paid ? 'y' : 'n'}`}>{m.paid ? '정산완료' : '미정산'}</span>}
            </li>
          ))}
          {Array.from({ length: Math.max(0, pod.capacity - pod.members.length) }).map((_, i) => (
            <li key={'e' + i} className="empty-seat"><span className="avatar">·</span><span className="muted">빈자리</span></li>
          ))}
        </ul>
      </section>

      {!myMember && <JoinBox pod={pod} s={s} me={me} notify={notify} requireName={requireName} reload={reload} />}

      {pod.fare != null && <Settlement pod={pod} me={me} isHost={isHost} notify={notify} />}

      {myMember && pod.fare == null && s !== 'cancelled' && isHost && <FareBox pod={pod} me={me} notify={notify} />}

      {(myMember || isNew) && s !== 'cancelled' && (
        <section className="block">
          <button className="btn wide" onClick={() => setShowShare((v) => !v)}>
            {showShare ? '공유 닫기' : '카톡방에 공유 · QR'}
          </button>
          {showShare && <SharePanel pod={pod} notify={notify} />}
        </section>
      )}

      {myMember && s !== 'cancelled' && <Chat pod={pod} me={me} notify={notify} />}

      {myMember && pod.fare == null && s !== 'cancelled' && (
        <button className="btn danger-ghost wide" onClick={async () => {
          const msg = isHost ? '모집자가 나가면 팟이 취소돼요. 취소할까요?' : '이 팟에서 나갈까요? 자리가 바로 다른 사람에게 열려요.'
          if (!window.confirm(msg)) return
          const r = await api.leavePod(me, pod.id)
          if (!r.ok) return notify(ERR[r.code] || r.code, 'warn')
          notify(isHost ? '팟을 취소했어요.' : '나갔어요. 빈자리가 실시간으로 다시 열렸어요.')
          if (isHost) go('/')
        }}>{isHost ? '팟 취소하기' : '팟에서 나가기'}</button>
      )}
    </div>
  )
}

function JoinBox({ pod, s, me, notify, requireName, reload }) {
  const [luggage, setLuggage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const lugLeft = pod.max_luggage - pod.members.reduce((a, m) => a + m.luggage, 0)

  if (s !== 'open') {
    return <section className="block"><div className="closed">{s === 'full' ? '자리가 다 찼어요. 누가 나가면 여기서 바로 보여요.' : `${STATE_LABEL[s]} 팟이에요.`}</div></section>
  }

  const join = () => requireName(async (who) => {
    setBusy(true); setResult(null)
    const t0 = performance.now()
    try {
      const r = await api.joinPod(who, pod.id, luggage)
      const sec = ((performance.now() - t0) / 1000).toFixed(2)
      if (r.ok) {
        notify(`확정! ${sec}초 만에 자리가 확보됐어요.`, 'ok')
        setResult({ ok: true, sec })
      } else {
        setResult({ ok: false, code: r.code, conflict: r.conflict })
        notify(ERR[r.code] || r.code, 'warn')
      }
      reload()
    } catch (e) {
      notify('오류: ' + e.message, 'warn')
    } finally { setBusy(false) }
  })

  return (
    <section className="block joinbox">
      <div className="field">내 캐리어 <span className="muted">(남은 캐리어 자리 {lugLeft})</span>
        <div className="seg">
          {[0, 1, 2].map((n) => (
            <button type="button" key={n} disabled={n > lugLeft} className={luggage === n ? 'on' : ''} onClick={() => setLuggage(n)}>{n}</button>
          ))}
        </div>
      </div>
      <button className="btn primary wide big" disabled={busy} onClick={join}>
        {busy ? '확정 중…' : '바로 합류하기'}
      </button>
      <p className="muted small">누르는 즉시 확정돼요. 모집자 답장을 기다릴 필요가 없어요.</p>
      {result && !result.ok && result.code === 'DUPLICATE' && (
        <div className="callout warn">
          비슷한 시간에 이미 확정된 팟이 있어서 <b>중복 확정이 막혔어요.</b>
          여러 팟에 걸어두고 나중에 취소 연락하는 일을 없애기 위한 규칙이에요.
          <button className="link" onClick={() => go(`/p/${result.conflict}`)}>내 팟 보러가기 →</button>
        </div>
      )}
    </section>
  )
}

function FareBox({ pod, me, notify }) {
  const [open, setOpen] = useState(false)
  const [fare, setFare] = useState('')
  const n = pod.members.length
  const sp = splitFare(Number(fare), n)
  if (!open) {
    return <section className="block"><button className="btn wide" onClick={() => setOpen(true)}>🚕 탑승 완료 · 요금 입력하고 정산 요청</button></section>
  }
  return (
    <section className="block farebox">
      <h2 className="label">택시 요금 입력</h2>
      <div className="fare-input">
        <input inputMode="numeric" placeholder="예: 13800" value={fare} onChange={(e) => setFare(e.target.value.replace(/\D/g, ''))} autoFocus />
        <span>원</span>
      </div>
      {Number(fare) > 0 && (
        <p className="muted">{n}명 · 동승자 1인 <b>{won(sp.per)}</b> (10원 단위 올림) · 내 몫 {won(sp.host)}</p>
      )}
      <div className="row gap">
        <button className="btn ghost" onClick={() => setOpen(false)}>닫기</button>
        <button className="btn primary grow" disabled={!fare} onClick={async () => {
          const r = await api.setFare(me, pod.id, Number(fare))
          if (!r.ok) return notify(ERR[r.code] || r.code, 'warn')
          notify('정산 요청을 보냈어요. 동승자 화면에 금액이 바로 떠요.', 'ok')
        }}>정산 요청 보내기</button>
      </div>
    </section>
  )
}

function Settlement({ pod, me, isHost, notify }) {
  const n = pod.members.length
  const sp = splitFare(pod.fare, n)
  const mine = pod.members.find((m) => m.user_id === me.id)
  const paidCount = pod.members.filter((m) => m.paid).length
  const done = paidCount === n
  return (
    <section className={`block settle ${done ? 'done' : ''}`}>
      <h2 className="label">정산 {done ? '· 완료' : `· ${paidCount}/${n}`}</h2>
      <div className="settle-grid">
        <div><span className="muted">총 요금</span><b>{won(pod.fare)}</b></div>
        <div><span className="muted">동승자 1인</span><b>{won(sp.per)}</b></div>
        <div><span className="muted">모집자 몫</span><b>{won(sp.host)}</b></div>
      </div>
      {mine && !isHost && (
        mine.paid
          ? <p className="ok-text">송금 완료로 표시했어요. <button className="link" onClick={() => api.markPaid(me, pod.id, false)}>취소</button></p>
          : <button className="btn primary wide big" onClick={async () => {
              const r = await api.markPaid(me, pod.id, true)
              if (r.ok) notify(`${won(sp.per)} 송금 완료로 표시했어요.`, 'ok')
            }}>{pod.host_name}님에게 {won(sp.per)} 송금하기</button>
      )}
      <p className="muted small">MVP에서는 실제 송금 없이 완료 표시만 해요. 정식 버전은 토스·카카오페이 송금 링크로 연결돼요.</p>
    </section>
  )
}

function SharePanel({ pod, notify }) {
  const [qr, setQr] = useState(null)
  const text = shareText(pod)
  useEffect(() => {
    QRCode.toDataURL(shareUrl(pod.id), { width: 520, margin: 1, color: { dark: '#14213d', light: '#ffffff' } }).then(setQr)
  }, [pod.id])
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); notify('복사했어요. 같이카 톡방에 붙여넣으세요.', 'ok') }
    catch { notify('복사가 막혔어요. 글을 길게 눌러 복사해 주세요.', 'warn') }
  }
  return (
    <div className="share">
      <pre className="share-text">{text}</pre>
      <div className="row gap">
        <button className="btn primary grow" onClick={copy}>톡방용 글 복사</button>
        {navigator.share && <button className="btn" onClick={() => navigator.share({ text }).catch(() => {})}>공유…</button>}
      </div>
      {qr && (
        <figure className="qr">
          <img src={qr} alt="이 팟으로 바로 들어오는 QR 코드" />
          <figcaption>찍으면 이 팟으로 바로 들어와요</figcaption>
        </figure>
      )}
    </div>
  )
}

function Chat({ pod, me, notify }) {
  const [v, setV] = useState('')
  const endRef = useRef(null)
  const msgs = pod.messages || []
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [msgs.length])
  const send = async (e) => {
    e.preventDefault()
    const body = v.trim()
    if (!body) return
    setV('')
    const r = await api.sendMessage(me, pod.id, body)
    if (!r.ok) notify(ERR[r.code] || r.code, 'warn')
  }
  return (
    <section className="block chat">
      <h2 className="label">탑승자 채팅 <span className="muted small">· 전화번호 공개 없이 연락</span></h2>
      <div className="msgs">
        {msgs.length === 0 && <p className="muted small center">“택정 앞 벤치에서 만나요”처럼 남겨보세요.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.user_id === me.id ? 'me' : ''}`}>
            {m.user_id !== me.id && <span className="sender">{m.nickname}</span>}
            <span className="bubble">{m.body}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="row gap" onSubmit={send}>
        <input className="grow" placeholder="메시지" value={v} onChange={(e) => setV(e.target.value)} maxLength={500} />
        <button className="btn primary">전송</button>
      </form>
    </section>
  )
}
