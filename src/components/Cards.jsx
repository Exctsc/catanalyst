// Resource cards drawn with the board's terrain art, and the click-to-pick
// rows built from them: the hand, trades, discards and dev card choices.
import { useState } from 'react'
import { ResourceIcon } from './BoardArt.jsx'
import { portRate } from '../game/gameActions'
import { bankTradePlan } from '../game/engine'

const RESOURCES = ['brick', 'wood', 'ore', 'wheat', 'sheep']
const EMPTY = { brick: 0, wood: 0, ore: 0, wheat: 0, sheep: 0 }
// The board's hex colours, so a card looks like the land it comes from.
const CARD_BG = { brick: '#C1440E', wood: '#228B22', ore: '#8C8C8C', wheat: '#F4D03F', sheep: '#90EE90' }
const total = b => RESOURCES.reduce((n, r) => n + (b[r] || 0), 0)

// One card. With onAdd it is a button (click adds one); onRemove adds a − chip.
export function ResourceCard({ resource, count = null, badge = null, onAdd, onRemove, disabled = false, label }) {
  const body = (
    <>
      <span className="g-rcard-art" style={{ background: CARD_BG[resource] }}><ResourceIcon resource={resource} size={34} /></span>
      {count !== null && <span className="g-rcard-count">{count}</span>}
      <span className="g-rcard-name">{resource}</span>
      {badge && <span className="g-rcard-badge">{badge}</span>}
    </>
  )
  return (
    <span className="g-rcard-wrap">
      {onAdd
        ? <button className="g-rcard g-rcard-btn" onClick={onAdd} disabled={disabled} aria-label={label ?? `Add ${resource}`}>{body}</button>
        : <span className="g-rcard" title={resource}>{body}</span>}
      {onRemove && count > 0 && (
        <button className="g-rcard-minus" onClick={onRemove} aria-label={`Remove ${resource}`}>−</button>
      )}
    </span>
  )
}

// The five resources; clicking a card adds one, its − takes one back.
// `max` caps each resource; `cap` caps the total.
export function CardPicker({ counts, onChange, max, cap = Infinity, badges }) {
  const full = total(counts) >= cap
  return (
    <div className="g-rcards">
      {RESOURCES.map(r => (
        <ResourceCard
          key={r}
          resource={r}
          count={counts[r]}
          badge={badges?.[r]}
          disabled={full || (max && counts[r] >= max[r])}
          onAdd={() => onChange({ ...counts, [r]: counts[r] + 1 })}
          onRemove={() => onChange({ ...counts, [r]: counts[r] - 1 })}
        />
      ))}
    </div>
  )
}

// A bundle of cards as small pictures with counts, e.g. in an offer or a cost.
export function Bundle({ cards }) {
  const kinds = RESOURCES.filter(r => cards[r] > 0)
  if (!kinds.length) return <span className="g-dim">nothing</span>
  return (
    <span className="g-bundle">
      {kinds.map(r => (
        <span key={r} className="g-bundle-item" title={`${cards[r]} ${r}`}>
          <span className="g-bundle-art" style={{ background: CARD_BG[r] }}><ResourceIcon resource={r} size={20} /></span>
          {cards[r] > 1 && <span className="g-bundle-n">×{cards[r]}</span>}
        </span>
      ))}
    </span>
  )
}

// Pick what to give and what to get, then trade with the bank (at your port
// rates, shown on each card) or offer it to another player.
export function TradePanel({ state, onBank, onOffer, onClose }) {
  const me = state.currentPlayerIndex
  const hand = state.players[me].resources
  const [give, setGive] = useState(EMPTY)
  const [get, setGet] = useState(EMPTY)
  const plan = bankTradePlan(state, give, get)
  const rates = Object.fromEntries(RESOURCES.map(r => [r, `${portRate(state, me, r)}:1`]))
  const picked = total(give) > 0 || total(get) > 0
  const clear = () => { setGive(EMPTY); setGet(EMPTY) }
  const opponents = state.players.map((p, i) => ({ ...p, i })).filter(p => p.i !== me)
  return (
    <div className="g-float-panel">
      <div className="g-panel-head">
        <strong>Trade</strong>
        <span className="g-dim">Click cards to add them. Port rates are on your cards.</span>
        <button className="g-panel-close" onClick={onClose} aria-label="Close trade">×</button>
      </div>
      <div className="g-trade-row"><span className="g-trade-label">You give</span><CardPicker counts={give} max={hand} badges={rates} onChange={setGive} /></div>
      <div className="g-trade-row"><span className="g-trade-label">You get</span><CardPicker counts={get} onChange={setGet} /></div>
      <div className="g-trade-actions">
        <button
          className="g-btn g-btn-primary"
          disabled={typeof plan === 'string'}
          onClick={() => { if (onBank(plan)) clear() }}
        >
          Trade with bank
        </button>
        <span className="g-dim">or offer to</span>
        {opponents.map(p => (
          <button key={p.i} className="g-btn" disabled={!total(give) || !total(get)} onClick={() => onOffer(p.i, give, get)}>
            <span className="g-swatch" style={{ background: p.colour }} /> {p.name}
          </button>
        ))}
        <button className="g-btn" disabled={!picked} onClick={clear}>Clear</button>
      </div>
      <div className="g-trade-hint">
        {!picked ? 'Pick cards to give and to get.' : typeof plan === 'string' ? `Bank: ${plan}` : 'Ready to trade with the bank.'}
      </div>
    </div>
  )
}
