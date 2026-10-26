export default function Seats({ n, cap, big }) {
  return (
    <span className={`seats ${big ? 'big' : ''}`} aria-label={`${cap}자리 중 ${n}자리 확정`}>
      {Array.from({ length: cap }).map((_, i) => <i key={i} className={i < n ? 'on' : ''} />)}
      <b>{n}/{cap}</b>
    </span>
  )
}
