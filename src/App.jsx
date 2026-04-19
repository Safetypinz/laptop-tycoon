import { useReducer, useEffect, useRef, useState } from 'react'
import {
  reducer, makeInitialState,
  DURATIONS, QUALITY_INFO, WORKER_DEFS,
  EXPANSION_STAGES, LOT_DISCOUNT, SUPPLIERS,
  SPECIAL_HIRES, specialUpgCost,
  rollAuditEvents, rollRepairEvents,
  upgradeCost, workerDuration,
  globalSpeedMult,
  currentExpansion, nextExpansion,
  MILESTONES,
} from './game'
import './App.css'

const SAVE_KEY = 'lrt-v2'

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return makeInitialState()
    const saved = JSON.parse(raw)
    const fresh = makeInitialState()
    return {
      ...fresh,
      ...saved,
      pipeline: { ...fresh.pipeline, ...saved.pipeline },
      workers:  { ...fresh.workers,  ...saved.workers  },
      specials: { ...fresh.specials, ...saved.specials },
      bonuses:  { ...fresh.bonuses,  ...saved.bonuses  },
      counters: { ...fresh.counters, ...saved.counters },
      features: { ...fresh.features, ...saved.features },
      earned:   saved.earned ?? fresh.earned,
    }
  } catch { return makeInitialState() }
}

export default function App() {
  const [state, dispatch]         = useReducer(reducer, null, loadState)
  const [working, setWorking]     = useState(null)          // { label, progress }
  const [workerStatus, setWS]     = useState({})            // { [id]: 'idle'|'working' }
  const [tab, setTab]             = useState('actions')     // 'actions' | 'shop' | 'milestones'
  const [newMilestone, setNM]     = useState(false)         // flash badge when milestone earned
  const [levelUpCard, setLevelUp] = useState(null)          // { icon, label, lots }

  const timerRef      = useRef(null)
  const tickRef       = useRef(null)
  const stateRef      = useRef(state)
  const workerBusy    = useRef({})
  const prevEarned    = useRef(state.earned.length)
  const prevStage     = useRef(state.expansionStage)

  // Keep stateRef fresh every render (no stale-closure issues in ticker)
  useEffect(() => { stateRef.current = state })

  // Level-up overlay when expansion stage changes
  useEffect(() => {
    if (state.expansionStage !== prevStage.current) {
      prevStage.current = state.expansionStage
      const exp = EXPANSION_STAGES.find(s => s.id === state.expansionStage)
      if (exp) setLevelUp(exp)
    }
  }, [state.expansionStage])

  // Flash milestone badge when new ones are earned
  useEffect(() => {
    if (state.earned.length > prevEarned.current) {
      prevEarned.current = state.earned.length
      setNM(true)
      setTimeout(() => setNM(false), 3000)
    }
  }, [state.earned.length])

  // Persist to localStorage
  useEffect(() => { localStorage.setItem(SAVE_KEY, JSON.stringify(state)) }, [state])

  // Cleanup manual timers on unmount
  useEffect(() => () => {
    clearTimeout(timerRef.current)
    clearInterval(tickRef.current)
  }, [])

  // ── Worker auto-processing ticker ─────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current

      WORKER_DEFS.forEach(def => {
        const worker = s.workers?.[def.id]
        if (!worker?.hired)                    return
        if (workerBusy.current[def.id])        return
        if (!s.pipeline[def.input]?.length)    return

        const speedMult    = globalSpeedMult(s)
        const duration     = Math.max(200, workerDuration(def.baseDuration, worker.level) / speedMult)
        workerBusy.current[def.id] = true
        setWS(ws => ({ ...ws, [def.id]: 'working' }))

        const preRolled = def.id === 'auditor'
          ? rollAuditEvents(s.pipeline.unchecked[0].quality)
          : null

        setTimeout(() => {
          if (def.id === 'auditor') {
            dispatch({ type: 'COMPLETE_AUDIT', payload: preRolled })
          } else if (def.id === 'tech') {
            const hasInvMgr = stateRef.current.specials?.inventory?.hired
            dispatch({ type: 'COMPLETE_REPAIR', payload: rollRepairEvents(hasInvMgr) })
          } else {
            dispatch({ type: def.actionType })
          }
          workerBusy.current[def.id] = false
          setWS(ws => ({ ...ws, [def.id]: 'idle' }))
        }, duration)
      })
    }, 500)

    return () => clearInterval(id)
  }, []) // runs once; reads live state via stateRef

  // ── Manual action helper ──────────────────────────────────────────────────
  function doAction(label, duration, onDone) {
    if (working) return
    const start = Date.now()
    setWorking({ label, progress: 0 })

    tickRef.current = setInterval(() => {
      const pct = Math.min(99, ((Date.now() - start) / duration) * 100)
      setWorking(w => w ? { ...w, progress: pct } : null)
    }, 50)

    timerRef.current = setTimeout(() => {
      clearInterval(tickRef.current)
      setWorking(null)
      onDone()
    }, duration)
  }

  const p = state.pipeline
  const w = state.workers

  // ── Manual actions ────────────────────────────────────────────────────────
  function buy() { dispatch({ type: 'BUY' }) }

  function audit() {
    if (!p.unchecked.length || working) return
    const ev = rollAuditEvents(p.unchecked[0].quality)
    doAction('Auditing', DURATIONS.audit, () => dispatch({ type: 'COMPLETE_AUDIT', payload: ev }))
  }

  function repair() {
    if (!p.audited.length || working) return
    const dur = Math.max(500, DURATIONS.repair + (p.audited[0].repairBonusMs || 0))
    const hasInvMgr = state.specials?.inventory?.hired
    doAction('Repairing', dur, () => dispatch({ type: 'COMPLETE_REPAIR', payload: rollRepairEvents(hasInvMgr) }))
  }

  function image() {
    if (!p.repaired.length || working) return
    const dur = DURATIONS.image + (p.repaired[0].imageBonusMs || 0)
    doAction('Imaging', dur, () => dispatch({ type: 'COMPLETE_IMAGE' }))
  }

  function clean() {
    if (!p.imaged.length || working) return
    doAction('Cleaning', DURATIONS.clean, () => dispatch({ type: 'COMPLETE_CLEAN' }))
  }

  function pack() {
    if (!p.cleaned.length || working) return
    doAction('Packing', DURATIONS.pack, () => dispatch({ type: 'COMPLETE_PACK' }))
  }

  function ship() {
    if (!p.packed.length) return
    dispatch({ type: 'BULK_SHIP' })
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const netProfit  = state.totalEarned - state.totalSpent
  const totalUnits = Object.values(p).reduce((s, a) => s + a.length, 0)
  const broke      = state.money < 3 && totalUnits === 0
  const expansion  = currentExpansion(state)
  const nextExp    = nextExpansion(state)

  const STAGES = [
    { key: 'unchecked', label: 'Incoming',  icon: '📥', color: '#8892a4' },
    { key: 'audited',   label: 'To Repair', icon: '🔧', color: '#f39c12' },
    { key: 'repaired',  label: 'To Image',  icon: '💿', color: '#3498db' },
    { key: 'imaged',    label: 'To Clean',  icon: '🧹', color: '#9b59b6' },
    { key: 'cleaned',   label: 'To Pack',   icon: '📦', color: '#2ecc71' },
    { key: 'packed',    label: 'Ready',     icon: '🚚', color: '#e67e22' },
  ]

  const isAuto = id => w?.[id]?.hired

  const ACTIONS = [
    { id: 'buy',    label: '🛒 Buy 1',  desc: '$3–$28 · random unit',                                          fn: buy,    off: false },
    { id: 'audit',  label: '🔍 Audit',  desc: isAuto('auditor') ? '🤖 automated' : `${p.unchecked.length} waiting`, fn: audit,  off: isAuto('auditor')  || !p.unchecked.length || !!working },
    { id: 'repair', label: '🔧 Repair', desc: isAuto('tech')    ? '🤖 automated' : `${p.audited.length} waiting`,   fn: repair, off: isAuto('tech')     || !p.audited.length   || !!working },
    { id: 'image',  label: '💿 Image',  desc: isAuto('imager')  ? '🤖 automated' : `${p.repaired.length} waiting`,  fn: image,  off: isAuto('imager')   || !p.repaired.length  || !!working },
    { id: 'clean',  label: '🧹 Clean',  desc: isAuto('cleaner') ? '🤖 automated' : `${p.imaged.length} waiting`,    fn: clean,  off: isAuto('cleaner')  || !p.imaged.length    || !!working },
    { id: 'pack',   label: '📦 Pack',   desc: isAuto('packer')  ? '🤖 automated' : `${p.cleaned.length} waiting`,   fn: pack,   off: isAuto('packer')   || !p.cleaned.length   || !!working },
    { id: 'ship',   label: `🚚 Ship${p.packed.length > 1 ? ` All (${p.packed.length})` : ''}`,   desc: `${p.packed.length} ready`,  fn: ship,  off: !p.packed.length, full: true },
  ]

  const shopBadge = WORKER_DEFS.some(d => !w[d.id]?.hired && state.money >= d.hireCost)

  return (
    <div className="app">

      <header className="topbar">
        <div className="brand">Laptop Refurb Tycoon</div>
        <div className="chips">
          <Chip icon="💵" label="Cash"       val={`$${state.money.toLocaleString()}`} />
          <Chip icon="📈" label="Profit"     val={`$${netProfit.toLocaleString()}`} accent={netProfit > 0 ? 'green' : netProfit < 0 ? 'red' : ''} />
          <Chip icon="✅" label="Sold"       val={state.sold} />
          <Chip icon={expansion.icon} label="Location" val={expansion.label} />
        </div>
      </header>

      <div className="content">

        {/* Pipeline */}
        <section className="section">
          <div className="section-label">Pipeline</div>
          <div className="pipeline">
            {STAGES.map(s => {
              const count      = p[s.key].length
              const bottleneck = count >= 5
              const next       = count > 0 ? p[s.key][0] : null
              return (
                <div key={s.key} className={`ps-box${bottleneck ? ' bottleneck' : ''}`} style={{ '--c': s.color }}>
                  <div className="ps-icon">{s.icon}</div>
                  <div className="ps-count">{count}</div>
                  <div className="ps-label">{s.label}</div>
                  {next && <div className="ps-dot" style={{ color: QUALITY_INFO[next.quality].color }}>●</div>}
                  {bottleneck && <div className="bottleneck-tag">⚠ BACKLOG</div>}
                </div>
              )
            })}
          </div>
        </section>

        {/* Expansion progress */}
        {nextExp && (
          <div className="expansion-bar">
            <span className="exp-label">{expansion.icon} {expansion.label}</span>
            <div className="exp-track">
              <div className="exp-fill" style={{ width: `${Math.min(100, (state.sold / nextExp.soldNeeded) * 100)}%` }} />
            </div>
            <span className="exp-next">{state.sold}/{nextExp.soldNeeded} → {nextExp.icon} {nextExp.label}</span>
          </div>
        )}

        {/* Manual action progress */}
        {working && (
          <div className="prog-bar">
            <span className="prog-label">{working.label}…</span>
            <div className="prog-track">
              <div className="prog-fill" style={{ width: `${working.progress}%` }} />
            </div>
            <span className="prog-pct">{Math.round(working.progress)}%</span>
          </div>
        )}

        {/* Tab bar */}
        <div className="tabs">
          <button className={`tab-btn${tab === 'actions' ? ' active' : ''}`} onClick={() => setTab('actions')}>
            Actions
          </button>
          <button className={`tab-btn${tab === 'shop' ? ' active' : ''}`} onClick={() => setTab('shop')}>
            Shop {shopBadge && <span className="tab-badge">!</span>}
          </button>
          <button className={`tab-btn${tab === 'milestones' ? ' active' : ''}`} onClick={() => { setTab('milestones'); setNM(false) }}>
            Milestones <span className={`tab-badge${newMilestone ? ' flash' : ''}`} style={{ visibility: state.earned.length > 0 ? 'visible' : 'hidden' }}>{state.earned.length}</span>
          </button>
        </div>

        {/* Actions panel */}
        {tab === 'actions' && (
          <div className="actions-wrap">
            <div className="supplier-strip">
              {SUPPLIERS.map(sup => (
                <button
                  key={sup.id}
                  className={`sup-pill${state.activeSupplier === sup.id ? ' active' : ''}`}
                  onClick={() => dispatch({ type: 'SET_SUPPLIER', payload: sup.id })}
                >
                  {sup.icon} {sup.label}
                  {sup.priceMult !== 1 && (
                    <span className={sup.priceMult > 1 ? 'pill-more' : 'pill-less'}>
                      {sup.priceMult > 1 ? `+${Math.round((sup.priceMult-1)*100)}%` : `-${Math.round((1-sup.priceMult)*100)}%`}
                    </span>
                  )}
                </button>
              ))}
            </div>
          <div className="actions-grid">
            {ACTIONS.map(a => (
              <button
                key={a.id}
                className={`action-btn${a.off ? ' dim' : ''}${a.full ? ' full' : ''}`}
                onClick={a.fn}
                disabled={a.off}
              >
                <div className="action-label">{a.label}</div>
                <div className="action-desc">{a.desc}</div>
              </button>
            ))}
          </div>
          </div>
        )}

        {/* Shop panel */}
        {tab === 'shop' && (
          <div className="shop">

            {/* Procurement / Lot buying */}
            <div className="shop-title">Procurement</div>

            {/* Supplier selector */}
            <div className="supplier-grid">
              {SUPPLIERS.map(sup => (
                <button
                  key={sup.id}
                  className={`supplier-btn${state.activeSupplier === sup.id ? ' active' : ''}`}
                  onClick={() => dispatch({ type: 'SET_SUPPLIER', payload: sup.id })}
                >
                  <div className="sup-icon">{sup.icon}</div>
                  <div className="sup-name">{sup.label}</div>
                  <div className="sup-stars">{'⭐'.repeat(sup.stars)}</div>
                  <div className="sup-desc">{sup.desc}</div>
                  <div className="sup-price">
                    {sup.priceMult > 1
                      ? <span className="sup-more">+{Math.round((sup.priceMult - 1) * 100)}% cost</span>
                      : sup.priceMult < 1
                      ? <span className="sup-less">-{Math.round((1 - sup.priceMult) * 100)}% cost</span>
                      : <span className="sup-neutral">Standard</span>}
                  </div>
                </button>
              ))}
            </div>

            <div className="lot-grid">
              {expansion.lots.map(qty => {
                const discount = LOT_DISCOUNT[qty] || 0
                const estCost  = qty === 1 ? '~$11' : `~$${Math.round(11 * qty * (1 - discount))}`
                const canAfford = qty === 1 ? state.money >= 3 : state.money >= Math.round(11 * qty * (1 - discount))
                return (
                  <button
                    key={qty}
                    className={`lot-btn${canAfford ? '' : ' dim'}`}
                    disabled={!canAfford}
                    onClick={() => qty === 1 ? dispatch({ type: 'BUY' }) : dispatch({ type: 'BUY_LOT', payload: qty })}
                  >
                    <div className="lot-qty">{qty === 1 ? '🛒 Buy 1' : `📦 Lot ×${qty}`}</div>
                    <div className="lot-cost">{estCost}</div>
                    {discount > 0 && <div className="lot-disc">{Math.round(discount * 100)}% off</div>}
                  </button>
                )
              })}
            </div>
            {nextExp && (
              <div className="lot-unlock-hint">
                Sell {nextExp.soldNeeded - state.sold} more to unlock {nextExp.icon} {nextExp.label} lot sizes
              </div>
            )}

            <div className="shop-divider" />
            <div className="shop-title">Pipeline Staff</div>
            {WORKER_DEFS.map(def => {
              const worker  = w[def.id] || { hired: false, level: 1 }
              const upg     = worker.hired ? upgradeCost(def, worker.level) : null
              const status  = workerStatus[def.id] || 'idle'
              const canHire = !worker.hired && state.money >= def.hireCost
              const canUpg  = worker.hired && upg !== null && state.money >= upg
              const spd     = worker.hired ? Math.round(workerDuration(def.baseDuration, worker.level) / 1000 * 10) / 10 : null

              return (
                <div key={def.id} className={`worker-card${worker.hired ? ' hired' : ''}`}>
                  <div className="wc-icon">{def.icon}</div>
                  <div className="wc-body">
                    <div className="wc-name">
                      {def.label}
                      {worker.hired && <LevelDots level={worker.level} />}
                    </div>
                    <div className="wc-desc">{def.desc}</div>
                    {worker.hired && (
                      <div className="wc-meta">
                        <span className={`wc-status ${status}`}>{status === 'working' ? '⚙ working' : '● idle'}</span>
                        <span className="wc-speed">{spd}s / unit</span>
                      </div>
                    )}
                  </div>
                  <div className="wc-btn-wrap">
                    {!worker.hired ? (
                      <button
                        className={`shop-btn hire${canHire ? '' : ' dim'}`}
                        disabled={!canHire}
                        onClick={() => dispatch({ type: 'HIRE_WORKER', payload: def.id })}
                      >
                        Hire<br /><span className="shop-cost">${def.hireCost}</span>
                      </button>
                    ) : (
                      <button
                        className={`shop-btn upgrade${canUpg ? '' : ' dim'}`}
                        disabled={!canUpg}
                        onClick={() => dispatch({ type: 'UPGRADE_WORKER', payload: def.id })}
                      >
                        {upg
                          ? <><span>Lvl {worker.level + 1}</span><br /><span className="shop-cost">${upg}</span></>
                          : <span className="maxed">MAX</span>
                        }
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Management section */}
            <div className="shop-divider" />
            <div className="shop-title">Management</div>
            {SPECIAL_HIRES.map(def => {
              const sp       = state.specials?.[def.id] || { hired: false, level: 1 }
              const upg      = sp.hired ? specialUpgCost(def, sp.level) : null
              const stageIdx = EXPANSION_STAGES.findIndex(s => s.id === def.unlockStage)
              const curIdx   = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
              const locked   = curIdx < stageIdx
              const canHire  = !sp.hired && !locked && state.money >= def.hireCost
              const canUpg   = sp.hired && upg !== null && state.money >= upg

              return (
                <div key={def.id} className={`worker-card${sp.hired ? ' hired' : ''}${locked ? ' locked' : ''}`}>
                  <div className="wc-icon">{def.icon}</div>
                  <div className="wc-body">
                    <div className="wc-name">
                      {def.label}
                      {sp.hired && def.maxLevel > 1 && <LevelDots level={sp.level} max={def.maxLevel} />}
                    </div>
                    <div className="wc-desc">{locked ? `🔒 Unlocks at ${EXPANSION_STAGES[stageIdx].label}` : def.desc}</div>
                    {sp.hired && <div className="wc-effect">{def.effectLabel(sp.level)}</div>}
                  </div>
                  <div className="wc-btn-wrap">
                    {!sp.hired ? (
                      <button
                        className={`shop-btn hire${canHire ? '' : ' dim'}`}
                        disabled={!canHire}
                        onClick={() => dispatch({ type: 'HIRE_SPECIAL', payload: def.id })}
                      >
                        {locked ? '🔒' : <>Hire<br /><span className="shop-cost">${def.hireCost}</span></>}
                      </button>
                    ) : (
                      <button
                        className={`shop-btn upgrade${canUpg ? '' : ' dim'}`}
                        disabled={!canUpg}
                        onClick={() => dispatch({ type: 'UPGRADE_SPECIAL', payload: def.id })}
                      >
                        {upg
                          ? <><span>Lvl {sp.level + 1}</span><br /><span className="shop-cost">${upg}</span></>
                          : <span className="maxed">MAX</span>}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Milestones panel */}
        {tab === 'milestones' && (
          <div className="milestones">
            <div className="ms-summary">
              {state.earned.length}/{MILESTONES.length} unlocked
              {state.earned.length > 0 && state.bonuses?.sell > 0 && (
                <span className="ms-active-bonus">+{Math.round(state.bonuses.sell * 100)}% sell bonus active</span>
              )}
            </div>
            {MILESTONES.map(m => {
              const done = state.earned.includes(m.id)
              const prog = m.progress ? m.progress(state) : null
              return (
                <div key={m.id} className={`ms-card${done ? ' earned' : ''}`}>
                  <div className="ms-icon">{m.icon}</div>
                  <div className="ms-body">
                    <div className="ms-name">{m.label}</div>
                    <div className="ms-desc">{m.desc}</div>
                    <div className={`ms-reward${done ? ' done' : ''}`}>
                      {done ? `✓ ${m.rewardDesc}` : m.rewardDesc}
                    </div>
                    {!done && prog && (
                      <div className="ms-prog-wrap">
                        <div className="ms-prog-bar">
                          <div className="ms-prog-fill" style={{ width: `${Math.min(100, (prog.cur / prog.max) * 100)}%` }} />
                        </div>
                        <span className="ms-prog-text">{prog.cur}/{prog.max}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {broke && (
          <div className="broke-banner">
            💸 Broke and pipeline empty.
            <button className="broke-reset" onClick={() => dispatch({ type: 'RESET' })}>Start Over</button>
          </div>
        )}

        {/* Event log */}
        <section className="section">
          <div className="section-label">Event Log</div>
          <div className="log">
            {state.log.length === 0 && <div className="log-empty">No events yet — buy a laptop!</div>}
            {state.log.map(e => (
              <div key={e.id} className="log-row">
                <span className="log-t">{e.t}</span>
                <span className="log-msg">{e.msg}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="stat-strip">
          <span>Earned: <b>${state.totalEarned.toLocaleString()}</b></span>
          <span>Spent: <b>${state.totalSpent.toLocaleString()}</b></span>
          <span>Best Profit: <b>${state.bestProfit.toLocaleString()}</b></span>
        </div>

      </div>

      {levelUpCard && (
        <div className="levelup-overlay" onClick={() => setLevelUp(null)}>
          <div className="levelup-card">
            <div className="lu-fireworks">🎉🎊🎉</div>
            <div className="lu-icon">{levelUpCard.icon}</div>
            <div className="lu-title">UPGRADED!</div>
            <div className="lu-name">{levelUpCard.label}</div>
            {levelUpCard.lots.filter(n => n > 1).length > 0 && (
              <div className="lu-perks">
                Lot sizes unlocked: {levelUpCard.lots.filter(n => n > 1).map(n => `×${n}`).join(', ')}
              </div>
            )}
            <button className="lu-dismiss" onClick={() => setLevelUp(null)}>Let's Go! 🚀</button>
          </div>
        </div>
      )}

      <div className="footer">
        <button className="reset-btn" onClick={() => { if (window.confirm('Reset all progress?')) dispatch({ type: 'RESET' }) }}>
          Reset Game
        </button>
      </div>

    </div>
  )
}

function Chip({ icon, label, val, accent }) {
  return (
    <div className="chip">
      <span className="chip-icon">{icon}</span>
      <div>
        <div className="chip-label">{label}</div>
        <div className={`chip-val${accent ? ` chip-${accent}` : ''}`}>{val}</div>
      </div>
    </div>
  )
}

function LevelDots({ level, max = 5 }) {
  return (
    <span className="level-dots">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`ldot${i < level ? ' on' : ''}`}>●</span>
      ))}
    </span>
  )
}
