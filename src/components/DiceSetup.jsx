import { parseDiceScript, DICE_LABELS } from '../game/dice'

// Dice mode picker for starting a game. `value` is { diceMode, script }.
export default function DiceSetup({ value, onChange }) {
  const parsed = parseDiceScript(value.script)
  return (
    <>
      <label className="g-field">Dice
        <select value={value.diceMode} onChange={e => onChange({ ...value, diceMode: e.target.value })}>
          {Object.entries(DICE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </label>
      {value.diceMode === 'scripted' && (
        <>
          <label className="g-field">Rolls
            <input
              type="text"
              value={value.script}
              placeholder="e.g. 6 8 3+4 12"
              onChange={e => onChange({ ...value, script: e.target.value })}
              aria-label="Scripted rolls"
            />
          </label>
          {typeof parsed === 'string'
            ? <ul className="g-errors"><li>{parsed}</li></ul>
            : <span className="g-dim">Totals or exact pairs (3+4). Random once the list runs out; editable mid-game.</span>}
        </>
      )}
    </>
  )
}
