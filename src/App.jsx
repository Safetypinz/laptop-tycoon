import { useReducer, useEffect, useRef, useState } from 'react'
import {
  reducer, makeInitialState,
  DURATIONS, QUALITY_INFO, WORKER_DEFS,
  EXPANSION_STAGES, LOT_DISCOUNT, SUPPLIERS,
  SPECIAL_HIRES, specialUpgCost, specialHireCost,
  rollAuditEvents, rollRepairEvents,
  upgradeCost, workerDuration, workerMaxCount, workerHireCost, workerAcceptsUnit, workerStageUnlocked, upgradeGate,
  workerLevel, workerMaxLevel, levelForSlot,
  activeBuffs, bossActive, bossReady, bossCooldownLeft,
  moraleUnlocked, moraleFace,
  payrollUnlocked, wageDue, PAYROLL_INTERVAL_MS,
  simulateOffline,
  RESEARCH, researchUnlocked, researchOwned, researchRoleMult,
  allShops, secondShopUnlocked, SECOND_SHOP_COST,
  globalSpeedMult,
  currentExpansion, nextExpansion, expansionReady, canAffordExpansion, expansionXpProgress,
  MILESTONES,
  CHANNELS, channelUnlocked,
  typeInfo, supplierCarries, estimatedBuyPrice, supplierFromId, supplierUnlocked,
  PART_SOURCES, partsNeeded, partSourceUnlocked,
  SCRAP_PART_YIELD, SCRAP_JUNK_PER_UNIT, SCRAP_EBAY_MULT, scrapEbayUnlocked,
  DEVICE_TYPES,
  FACILITIES, facilityUnlocked,
  DECISION_EVENTS, pickDecisionEvent, floorMgrAutoResolves, contractPriorityTypes, isBankrupt,
  CONTRACT_TEMPLATES, contractUnlocked, contractProgress, contractAllMet, contractTimeLeft, contractsFeatureVisible, scaledContract, maxConcurrentContracts, activeContractsList,
} from './game'
import { t as translate, tf as translatef } from './i18n'
import './App.css'

const SAVE_KEY = 'lrt-v6'
const LEGACY_KEYS = ['lrt-v5', 'lrt-v4', 'lrt-v3', 'lrt-v2', 'lrt-v1']

function migratePipeline(pipeline) {
  if (!pipeline) return pipeline
  const fix = arr => Array.isArray(arr) ? arr.map(u => u && !u.type ? { ...u, type: 'laptop' } : u) : arr
  return Object.fromEntries(Object.entries(pipeline).map(([k, v]) => [k, fix(v)]))
}

// Old saves used { hired: bool, level }; new shape is { count, level }.
// Also: tech now uses per-hire levels { hireLevels: [1,1,2] } on top of count.
function migrateWorkers(workers) {
  if (!workers) return workers
  return Object.fromEntries(Object.entries(workers).map(([k, v]) => {
    if (!v || typeof v !== 'object') return [k, v]
    const def = WORKER_DEFS.find(d => d.id === k)
    // Coerce pre-count shape first.
    let next = (typeof v.count === 'number')
      ? v
      : { count: v.hired ? 1 : 0, level: v.level || 1 }
    // Seed per-hire array for tech so old saves get [L, L, L] for their crew.
    if (def?.perHire && !Array.isArray(next.hireLevels)) {
      const lvl = next.level || 1
      next = { ...next, hireLevels: Array(next.count || 0).fill(lvl), level: lvl }
    }
    return [k, next]
  }))
}

function tagLegacyLots(pipeline, existingLots) {
  // Group untagged (pre-v3) units by supplierId into synthetic "legacy" lots so they show on the Loads panel.
  const knownLots = new Set((existingLots || []).map(l => l.id))
  const bySupplier = {}                // supplierId -> { count, cost }
  const next = {}
  for (const [stage, arr] of Object.entries(pipeline || {})) {
    next[stage] = (arr || []).map(u => {
      if (!u) return u
      if (u.lotId) return u
      const sid = u.supplierId || 'unknown'
      const lotId = `Llegacy_${sid}`
      bySupplier[sid] = bySupplier[sid] || { lotId, count: 0, cost: 0 }
      bySupplier[sid].count += 1
      bySupplier[sid].cost  += u.buyPrice || 0
      return { ...u, lotId, purchasedAt: u.purchasedAt || Date.now() }
    })
  }
  const legacyLots = Object.entries(bySupplier)
    .filter(([, v]) => !knownLots.has(v.lotId))
    .map(([sid, v]) => {
      const sup = supplierFromId(sid)
      return {
        id: v.lotId, supplierId: sid, supplierLabel: sup.label, supplierIcon: sup.icon,
        typeFilter: null, purchasedAt: Date.now(), qty: v.count, cost: v.cost, legacy: true,
      }
    })
  return { pipeline: next, legacyLots }
}

let pendingOfflineSummary = null

function loadState() {
  try {
    // Clean up legacy keys from older schemas — they're no longer compatible.
    for (const k of LEGACY_KEYS) localStorage.removeItem(k)
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return makeInitialState()
    const saved = JSON.parse(raw)
    const fresh = makeInitialState()
    const mergedPipeline = { ...fresh.pipeline, ...migratePipeline(saved.pipeline) }
    const { pipeline: taggedPipeline, legacyLots } = tagLegacyLots(mergedPipeline, saved.lots)
    const merged = {
      ...fresh,
      ...saved,
      pipeline: taggedPipeline,
      lots: [...legacyLots, ...(saved.lots || [])],
      vendorStats: saved.vendorStats || {},
      workers:  { ...fresh.workers,  ...migrateWorkers(saved.workers) },
      specials: { ...fresh.specials, ...saved.specials },
      bonuses:  { ...fresh.bonuses,  ...saved.bonuses  },
      counters: { ...fresh.counters, ...saved.counters },
      features:   { ...fresh.features,   ...saved.features   },
      facilities: { ...fresh.facilities, ...saved.facilities },
      earned:     saved.earned ?? fresh.earned,
      activeEvent: null,  // never restore mid-event
      lastEventAt: saved.lastEventAt ?? 0,
      activeContract: null,
      activeContracts: Array.isArray(saved.activeContracts) && saved.activeContracts.length > 0
        ? saved.activeContracts
        : (saved.activeContract ? [saved.activeContract] : []),
      lotsIncoming: Array.isArray(saved.lotsIncoming) ? saved.lotsIncoming : [],
      settings: { ...fresh.settings, ...(saved.settings || {}) },
    }
    // Offline catch-up: simulate crew productivity while tab was closed
    const lastActive = saved.lastActiveAt || Date.now()
    const elapsed   = Date.now() - lastActive
    const { state: caught, summary } = simulateOffline(merged, elapsed)
    pendingOfflineSummary = summary
    return caught
  } catch { return makeInitialState() }
}

export default function App() {
  const [state, dispatch]         = useReducer(reducer, null, loadState)
  const lang = state.lang || 'en'
  const t = (key) => translate(key, lang)
  const tf = (key, args) => translatef(key, lang, args)
  const logText = (e) => {
    if (e?.key) {
      const out = translatef(e.key, lang, e.args || {})
      if (out && out !== e.key) return out
    }
    return e?.msg || ''
  }
  const [working, setWorking]     = useState(null)          // { label, progress }
  const [queue, setQueue]         = useState([])            // queued manual action ids
  const [workerStatus, setWS]     = useState({})            // { [id]: 'idle'|'working' }
  const [tab, setTab]             = useState('actions')     // 'actions' | 'shop' | 'contracts' | 'milestones' | 'stats'
  const [shopTab, setShopTab]     = useState('buy')          // 'buy' | 'hire' | 'facilities' | 'research'
  const [newMilestone, setNM]     = useState(false)         // flash badge when milestone earned
  const [levelUpCard, setLevelUp] = useState(null)          // current unlock card shown
  const [unlockQueue, setUnlockQ] = useState([])            // queued unlocks waiting to show
  const [logOpen, setLogOpen]     = useState(false)
  const [tickNow, setTickNow]     = useState(Date.now())     // for buff countdowns
  const [eventToast, setEventToast] = useState(null)         // { msg, moneyDelta, partsDelta, expiresAt }
  const [alertToast, setAlertToast] = useState(null)         // { msg, icon, variant, expiresAt } for action feedback
  const [eventOpen, setEventOpen]   = useState(false)        // true = full card shown, false = chip only
  const [expandModal, setExpandModal] = useState(false)      // paid-expansion confirm modal
  const [scrapOpen, setScrapOpen]   = useState(false)        // scrap bin expanded?
  const [offlineSummary, setOfflineSummary] = useState(() => {
    const s = pendingOfflineSummary
    pendingOfflineSummary = null
    return s
  })

  const timerRef      = useRef(null)
  const tickRef       = useRef(null)
  const stateRef      = useRef(state)
  const workerBusy    = useRef({})
  const workerClaimed = useRef(new Set())  // unit IDs currently in flight (across all roles)
  const prevEarned    = useRef((state.unclaimedMilestones?.length || 0) + state.earned.length)
  const prevStage     = useRef(state.expansionStage)
  const fileInputRef  = useRef(null)
  const throughputRef = useRef({ snapshots: [] })
  const [, forceFlow] = useState(0)

  function exportSave() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `laptop-tycoon-save-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function importSave(e) {
    const file = e.target.files?.[0]
    e.target.value = ''  // let user re-import same file if needed
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const saved  = JSON.parse(reader.result)
        const fresh  = makeInitialState()
        const merged = {
          ...fresh, ...saved,
          pipeline: { ...fresh.pipeline, ...saved.pipeline },
          workers:  { ...fresh.workers,  ...migrateWorkers(saved.workers) },
          specials: { ...fresh.specials, ...saved.specials },
          bonuses:  { ...fresh.bonuses,  ...saved.bonuses  },
          counters: { ...fresh.counters, ...saved.counters },
          features:   { ...fresh.features,   ...saved.features   },
          facilities: { ...fresh.facilities, ...saved.facilities },
          earned:     saved.earned ?? fresh.earned,
          activeEvent: null,
          lastEventAt: saved.lastEventAt ?? 0,
          activeContract: null,
          activeContracts: Array.isArray(saved.activeContracts) && saved.activeContracts.length > 0
            ? saved.activeContracts
            : (saved.activeContract ? [saved.activeContract] : []),
          lotsIncoming: Array.isArray(saved.lotsIncoming) ? saved.lotsIncoming : [],
          settings: { ...fresh.settings, ...(saved.settings || {}) },
        }
        dispatch({ type: 'LOAD_STATE', payload: merged })
      } catch {
        alert(t('save.invalid'))
      }
    }
    reader.readAsText(file)
  }

  // Keep stateRef fresh every render (no stale-closure issues in ticker)
  useEffect(() => { stateRef.current = state })

  // Unlock detection — any new worker/channel/stage unlock queues a celebration card
  const seenUnlocksRef = useRef(null)
  useEffect(() => {
    const current = new Set()
    if (state.expansionStage) current.add(`stage:${state.expansionStage}`)
    for (const def of WORKER_DEFS) {
      if (!workerStageUnlocked(def, state)) continue
      if (state.sold >= (def.unlockSold || 0)) current.add(`worker:${def.id}`)
    }
    for (const ch  of CHANNELS)    if (channelUnlocked(ch, state))          current.add(`channel:${ch.id}`)
    const stageIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
    for (const t of DEVICE_TYPES) {
      const reqIdx = EXPANSION_STAGES.findIndex(s => s.id === t.unlockStage)
      if (reqIdx === -1 || stageIdx >= reqIdx) current.add(`device:${t.id}`)
    }
    for (const fac of FACILITIES) {
      if (facilityUnlocked(fac, state)) current.add(`facility:${fac.id}`)
    }

    // First run: seed the set without firing overlays for already-unlocked items
    if (!seenUnlocksRef.current) {
      seenUnlocksRef.current = current
      prevStage.current = state.expansionStage
      return
    }

    const seen = seenUnlocksRef.current
    const newOnes = []
    for (const key of current) {
      if (seen.has(key)) continue
      const [kind, id] = key.split(':')
      if (kind === 'stage') {
        const st = EXPANSION_STAGES.find(s => s.id === id)
        if (st) newOnes.push({ kind, icon: st.icon, title: t('unlock.upgraded'), name: t('stage.' + st.id + '.label'), detail: st.lots.filter(n => n > 1).length ? `${t('unlock.lotSizes')} ${st.lots.filter(n => n > 1).map(n => `×${n}`).join(', ')}` : '' })
      } else if (kind === 'worker') {
        const def = WORKER_DEFS.find(d => d.id === id)
        if (def) newOnes.push({ kind, icon: def.icon, title: t('unlock.newHire'), name: t('worker.' + def.id + '.label'), detail: `${t('worker.' + def.id + '.desc')} · $${def.hireCost} ${t('unlock.toHire')}` })
      } else if (kind === 'channel') {
        const ch = CHANNELS.find(c => c.id === id)
        if (ch) newOnes.push({ kind, icon: ch.icon, title: t('unlock.newChannel'), name: t('channel.' + ch.id + '.label'), detail: `${t('channel.' + ch.id + '.desc')} · ${Math.round(ch.feePct*100)}% ${t('unlock.fee')}` })
      } else if (kind === 'device') {
        const dt = DEVICE_TYPES.find(d => d.id === id)
        if (dt) {
          const parts = []
          if (dt.sellMult   !== 1) parts.push(`${dt.sellMult}× ${t('unlock.sellValue')}`)
          if (dt.repairMult !== 1) parts.push(`${dt.repairMult}× ${t('unlock.repairTime')}`)
          if (dt.priceMult  !== 1) parts.push(`${dt.priceMult}× ${t('unlock.cost')}`)
          newOnes.push({ kind, icon: dt.icon, title: t('unlock.newDevice'), name: t('device.' + dt.id + '.label'), detail: parts.join(' · ') || t('unlock.available') })
        }
      } else if (kind === 'facility') {
        const fac = FACILITIES.find(f => f.id === id)
        if (fac) newOnes.push({ kind, icon: fac.icon, title: t('unlock.newFacility'), name: t('facility.' + fac.id + '.label'), detail: `${t('facility.' + fac.id + '.desc')} · $${fac.cost.toLocaleString()} ${t('unlock.toInstall')}` })
      }
    }
    if (newOnes.length) {
      const stageCard = newOnes.find(o => o.kind === 'stage')
      if (stageCard && newOnes.length > 1) {
        const rest = newOnes.filter(o => o !== stageCard)
        const bundle = {
          kind: 'stage',
          icon: stageCard.icon,
          title: stageCard.title,
          name: stageCard.name,
          detail: stageCard.detail,
          items: rest.map(o => ({ icon: o.icon, name: o.name, detail: o.detail, kind: o.kind })),
        }
        setUnlockQ(q => [...q, bundle])
      } else {
        setUnlockQ(q => [...q, ...newOnes])
      }
    }
    seenUnlocksRef.current = current
  }, [state.expansionStage, state.sold])

  // Show next queued unlock when current card is dismissed
  useEffect(() => {
    if (!levelUpCard && unlockQueue.length) {
      setLevelUp(unlockQueue[0])
      setUnlockQ(q => q.slice(1))
    }
  }, [levelUpCard, unlockQueue])

  // Flash milestone badge when new ones unlock (ready to claim) or are claimed
  useEffect(() => {
    const total = (state.unclaimedMilestones?.length || 0) + state.earned.length
    if (total > prevEarned.current) {
      prevEarned.current = total
      setNM(true)
      setTimeout(() => setNM(false), 3000)
    }
  }, [state.earned.length, state.unclaimedMilestones?.length])

  // Persist to localStorage (stamps lastActiveAt so offline catch-up can compute delta)
  useEffect(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, lastActiveAt: Date.now() }))
  }, [state])

  // Lot drip-feed: units land in pipeline.incoming from BUY_LOT; trickle into
  // unchecked so big lots don't flash-dump 20+ units at once.
  // Target: ~3-5s to drain a full lot (spec Phase B). Step scales with queue
  // size so a 50-unit bulk doesn't crawl in at 1/tick for 15 seconds.
  useEffect(() => {
    const TICK_MS = 300
    const TARGET_TICKS = 15   // 15 × 300ms = 4.5s target drain for any non-trivial lot
    const id = setInterval(() => {
      const inc = stateRef.current.pipeline?.incoming || []
      if (inc.length === 0) return
      const step = Math.max(1, Math.ceil(inc.length / TARGET_TICKS))
      dispatch({ type: 'DRIP_INCOMING', payload: step })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [])

  // Parts delivery ticker — drains partsIncoming orders whose arriveAt has passed.
  useEffect(() => {
    const id = setInterval(() => {
      const pending = stateRef.current.partsIncoming || []
      if (pending.length === 0) return
      if (pending.some(o => o.arriveAt <= Date.now())) {
        dispatch({ type: 'RECEIVE_PARTS' })
      }
    }, 500)
    return () => clearInterval(id)
  }, [])

  // Lot delivery ticker — drains lotsIncoming shipments whose arriveAt has passed.
  useEffect(() => {
    const id = setInterval(() => {
      const pending = stateRef.current.lotsIncoming || []
      if (pending.length === 0) return
      if (pending.some(o => o.arriveAt <= Date.now())) {
        dispatch({ type: 'RECEIVE_LOT' })
      }
    }, 500)
    return () => clearInterval(id)
  }, [])

  // Auto-ship ticker — when the player turns it on (e.g. walking away),
  // flush packed units every 15s so payroll doesn't starve.
  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current
      if (!s.autoShip) return
      if ((s.pipeline?.packed?.length || 0) === 0) return
      dispatch({ type: 'BULK_SHIP' })
    }, 15000)
    return () => clearInterval(id)
  }, [])

  // Throughput sampler — snapshot counters every 5s, keep 60s window.
  // Rate = (newest - oldest) / windowSecs * 60 → units/min per stage.
  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current
      const c = s.counters || {}
      const snap = {
        ts: Date.now(),
        audited:  c.audited  || 0,
        repaired: c.repaired || 0,
        imaged:   c.imaged   || 0,
        cleaned:  c.cleaned  || 0,
        packed:   c.packed   || 0,
        sold:     s.sold     || 0,
      }
      const cutoff = snap.ts - 60_000
      const next = [...throughputRef.current.snapshots, snap].filter(x => x.ts >= cutoff)
      throughputRef.current = { snapshots: next }
      forceFlow(n => (n + 1) & 0xff)
    }, 5000)
    return () => clearInterval(id)
  }, [])

  // Buff countdown + prune + morale decay — 1s tick.
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now()
      setTickNow(now)
      const s = stateRef.current
      const buffs = s.buffs || []
      if (buffs.some(b => b.expiresAt <= now)) {
        dispatch({ type: 'PRUNE_BUFFS' })
      }
      // Morale passively decays ~1 point per minute (only once unlocked)
      if ((s.lastMoraleDecayAt || now) + 60_000 <= now) {
        dispatch({ type: 'MORALE_DECAY' })
      }
      // Payroll: pay the crew once per minute (unlocks at Shop)
      if ((s.lastPayrollAt || now) + 60_000 <= now) {
        dispatch({ type: 'RUN_PAYROLL' })
      }
      // Re-apply sticky priority so new units land at the front of their queues
      if (s.priorityType) {
        dispatch({ type: 'REAPPLY_PRIORITY' })
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // Floor Manager automation — runs when manager is hired.
  // (1) auto-prioritize pipeline by active contract's needed type
  // (2) auto-order parts from eBay when parts run low + money covers it
  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current
      const hasMgr    = !!s.specials?.manager?.hired
      const hasGuard  = !!s.facilities?.idleGuard
      if (!hasMgr && !hasGuard) return

      // Auto-prioritize by active contracts — Floor Manager only
      if (hasMgr) {
        const contracts = activeContractsList(s)
        if (contracts.length > 0) {
          const sorted = [...contracts].sort((a, b) =>
            contractTimeLeft(s, a) - contractTimeLeft(s, b))
          for (const ac of sorted) {
            const prog = contractProgress(s, ac) || {}
            const req  = ac.required || CONTRACT_TEMPLATES.find(c => c.id === ac.id)?.required || {}
            const nextType = Object.keys(req).find(t => !prog[t]?.done)
            if (nextType) { dispatch({ type: 'SET_PRIORITY_TYPE', payload: nextType }); break }
          }
        }
      }

      // Auto-order parts: Floor Manager L2+ OR Idle Guard facility
      const mgrAutoParts = hasMgr && (s.specials?.manager?.level || 1) >= 2
      if (mgrAutoParts || hasGuard) {
        const incomingTotal = (s.partsIncoming || []).reduce((n, o) => n + o.qty, 0)
        const totalParts    = (s.parts || 0) + incomingTotal
        const hasPending    = (s.partsIncoming || []).length > 0
        const threshold     = hasGuard ? 5 : 4
        if (totalParts < threshold && !hasPending && s.money >= 25) {
          dispatch({ type: 'ORDER_PARTS', payload: 'ebay' })
        }
        // Softlock escape: tech queue backed up, no parts & can't afford any,
        // scrap pile available → cash it out. Guards against the dead-state
        // where audited units need parts the player can't buy.
        const scrapPile = (s.pipeline?.scrapped || []).length
        const auditedWaiting = (s.pipeline?.audited || []).length
        const partsStuck = auditedWaiting >= 5 && totalParts === 0 && !hasPending && s.money < 25
        if (scrapPile >= 5 && partsStuck) {
          dispatch({ type: 'SCRAP_SELL_JUNK' })
        }
      }
    }, 2000)
    return () => clearInterval(id)
  }, [])

  // Cleanup manual timers on unmount
  useEffect(() => () => {
    clearTimeout(timerRef.current)
    clearInterval(tickRef.current)
  }, [])

  // ── Decision event ticker ───────────────────────────────────────────────
  // Cadence: 10s poll, 60s cooldown minimum, 40% fire chance once eligible.
  // Avg wait between events ≈ 60s cooldown + ~12s roll = ~72s. More juice than the old ~95s.
  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current
      if (s.activeEvent) return
      if (Date.now() - (s.lastEventAt || 0) < 60_000) return
      if (Math.random() > 0.40) return
      const ev = pickDecisionEvent(s)
      if (ev) dispatch({ type: 'FIRE_EVENT', payload: ev.id })
    }, 10_000)
    return () => clearInterval(id)
  }, [])

  // ── Bankruptcy detector ────────────────────────────────────────────────
  // Poll every 3s. Guard with a short grace period so a transient state
  // (mid-dispatch, just bought a lot, etc.) doesn't trigger prematurely.
  const bankruptSinceRef = useRef(null)
  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current
      if (s.gameOver) { bankruptSinceRef.current = null; return }
      if (!isBankrupt(s)) { bankruptSinceRef.current = null; return }
      if (bankruptSinceRef.current == null) bankruptSinceRef.current = Date.now()
      else if (Date.now() - bankruptSinceRef.current > 5000) {
        dispatch({ type: 'GAME_OVER' })
        bankruptSinceRef.current = null
      }
    }, 3000)
    return () => clearInterval(id)
  }, [])

  // ── Event lifecycle: auto-dismiss after 60s if ignored (paused while open) ─
  // When the player opens the card, we freeze elapsed time and shift
  // activeEventAt forward by the paused duration on close so the chip picks up
  // exactly where it left off.
  const pausedAtRef = useRef(null)
  useEffect(() => {
    if (!state.activeEvent) { setEventOpen(false); pausedAtRef.current = null; return }
    if (eventOpen) {
      if (pausedAtRef.current == null) pausedAtRef.current = Date.now()
      return
    }
    if (pausedAtRef.current != null) {
      const pausedMs = Date.now() - pausedAtRef.current
      pausedAtRef.current = null
      dispatch({ type: 'SHIFT_EVENT_START', payload: pausedMs })
      return
    }
    const startedAt = state.activeEventAt || Date.now()
    const remaining = Math.max(0, 60_000 - (Date.now() - startedAt))
    const timeoutId = setTimeout(() => {
      if (stateRef.current.activeEvent === state.activeEvent) {
        dispatch({ type: 'DISMISS_EVENT' })
      }
    }, remaining)
    return () => clearTimeout(timeoutId)
  }, [state.activeEvent, eventOpen, state.activeEventAt])

  // ── Floor Manager L3 auto-resolve ──────────────────────────────────────
  // When an event is active and FM L3 is hired, auto-resolve after 4s.
  // 'safe' = last option (usually decline), 'greedy' = first option (usually accept).
  const autoResolveFiredRef = useRef(null)
  useEffect(() => {
    if (!state.activeEvent) { autoResolveFiredRef.current = null; return }
    if (!floorMgrAutoResolves(state)) return
    if (autoResolveFiredRef.current === state.activeEvent) return
    autoResolveFiredRef.current = state.activeEvent

    const timeoutId = setTimeout(() => {
      const s = stateRef.current
      if (!s.activeEvent) return
      const ev = DECISION_EVENTS.find(e => e.id === s.activeEvent)
      if (!ev) return
      const mode = s.settings?.autoResolve || 'safe'
      const optionIndex = mode === 'greedy' ? 0 : (ev.options.length - 1)
      const optText = typeof ev.options[optionIndex].label === 'function'
        ? ev.options[optionIndex].label(s)
        : ev.options[optionIndex].label
      const before = s
      dispatch({ type: 'RESOLVE_EVENT', payload: { optionIndex } })
      setTimeout(() => {
        const after = stateRef.current
        setEventToast({
          icon: ev.icon,
          title: `${ev.title} (auto)`,
          choice: optText,
          msg: after.log?.[0]?.msg || '',
          moneyDelta: (after.money || 0) - (before.money || 0),
          partsDelta: (after.parts || 0) - (before.parts || 0),
          expiresAt: Date.now() + 5000,
        })
      }, 20)
    }, 4000)
    return () => clearTimeout(timeoutId)
  }, [state.activeEvent])

  // ── Contract ticker (auto-fail on expire; completion is manual) ────────
  // Dedupe via local Set so the popup queues once per expired contract
  // (dispatch is async vs stateRef, so naive loop fires multiple times).
  const failNotified = useRef(new Set())
  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current
      const contracts = activeContractsList(s)
      const liveIds = new Set(contracts.map(c => c.id))
      // Clean up notified set so a future re-accept of same id works
      for (const id of failNotified.current) {
        if (!liveIds.has(id)) continue // keep; will be cleared when not-live
      }
      failNotified.current = new Set([...failNotified.current].filter(id => liveIds.has(id)))
      for (const ac of contracts) {
        if (!contractAllMet(s, ac) && contractTimeLeft(s, ac) <= 0) {
          if (failNotified.current.has(ac.id)) continue
          failNotified.current.add(ac.id)
          const tpl = CONTRACT_TEMPLATES.find(c => c.id === ac.id)
          if (tpl) {
            const deposit = ac.deposit ?? tpl.deposit
            setUnlockQ(q => [...q, {
              kind: 'fail',
              icon: '😠',
              title: translate('contracts.furious', lang),
              name: translate('contract.' + tpl.id + '.label', lang),
              detail: translatef('contracts.furiousDetail', lang, { name: translate('contract.' + tpl.id + '.label', lang), deposit: deposit.toLocaleString() }),
            }])
          }
          dispatch({ type: 'FAIL_CONTRACT', payload: ac.id })
        }
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Worker auto-processing ticker ─────────────────────────────────────────
  // Each role can have N workers (worker.count). We track busy COUNT per role
  // and spawn (count - busy) parallel workers each tick as units are available.
  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current

      // Unit IDs already claimed in flight (by setTimeouts that haven't resolved).
      // Needed so tech + desktopTech reading the same `audited` queue don't both
      // claim a unit that's still being processed.
      const claimed = workerClaimed.current

      WORKER_DEFS.forEach(def => {
        const worker = s.workers?.[def.id]
        const count  = worker?.count || 0
        if (count < 1)                                          return
        const busy   = workerBusy.current[def.id] || 0

        // Utility Tech: flex role. Picks the longest non-repair queue each
        // slot, advances one unit at 1.5× base duration. No parts needed.
        if (def.id === 'utility') {
          const flexStages = [
            { from: 'unchecked', dur: DURATIONS.audit, action: 'COMPLETE_AUDIT', key: 'auditor' },
            { from: 'repaired',  dur: DURATIONS.image, action: 'COMPLETE_IMAGE', key: 'imager'  },
            { from: 'imaged',    dur: DURATIONS.clean, action: 'COMPLETE_CLEAN', key: 'cleaner' },
            { from: 'cleaned',   dur: DURATIONS.pack,  action: 'COMPLETE_PACK',  key: 'packer'  },
          ]
          const utilSlots = Math.max(0, count - busy)
          for (let i = 0; i < utilSlots; i++) {
            const picks = flexStages
              .map(st => ({ ...st, q: (s.pipeline[st.from] || []).filter(u => u && !claimed.has(u.id)) }))
              .filter(p => p.q.length > 0)
              .sort((a, b) => b.q.length - a.q.length)
            if (picks.length === 0) break
            const pick = picks[0]
            const unit = pick.q[0]
            if (!unit) break
            const speedMult = globalSpeedMult(s) / researchRoleMult(s, pick.key)
            const baseDur   = workerDuration(pick.dur, worker.level)
            const jitter    = 0.85 + Math.random() * 0.30
            const duration  = Math.max(500, (baseDur * 1.5 / speedMult) * jitter)
            claimed.add(unit.id)
            workerBusy.current.utility = (workerBusy.current.utility || 0) + 1
            setWS(ws => ({ ...ws, utility: 'working' }))
            const preRolled = pick.action === 'COMPLETE_AUDIT'
              ? rollAuditEvents(unit.quality, s)
              : null
            setTimeout(() => {
              if (pick.action === 'COMPLETE_AUDIT') {
                dispatch({ type: 'COMPLETE_AUDIT', payload: { ...preRolled, unitId: unit.id } })
              } else {
                dispatch({ type: pick.action, payload: { unitId: unit.id } })
              }
              claimed.delete(unit.id)
              workerBusy.current.utility = Math.max(0, (workerBusy.current.utility || 1) - 1)
              if (workerBusy.current.utility === 0) {
                setWS(ws => ({ ...ws, utility: 'idle' }))
              }
            }, duration)
          }
          return
        }

        const queue  = s.pipeline[def.input] || []
        // Eligible units: in the input queue, accepted by this role, not yet claimed.
        let eligible = queue.filter(u => u && !claimed.has(u.id) && workerAcceptsUnit(def, u, s))
        if (eligible.length === 0)                              return

        // Floor Manager auto-priority: if a contract is active, reorder eligible
        // so units matching unmet demand get picked up first.
        const priorityTypes = contractPriorityTypes(s)
        if (priorityTypes) {
          const rank = type => {
            const i = priorityTypes.indexOf(type || 'laptop')
            return i === -1 ? 999 : i
          }
          eligible = [...eligible].sort((a, b) => rank(a.type) - rank(b.type))
        }

        const slots = Math.min(count - busy, eligible.length)
        // Track parts reserved *during this tick iteration* for multi-tech parallelism.
        let partsReservedThisTick = 0
        for (let i = 0; i < slots; i++) {
          const unit = eligible[i]
          if (!unit) break

          // Parts gate: tech + desktopTech can't start a repair without parts.
          // Boss Mode waives the part cost for the duration of the burst.
          const isRepair = def.id === 'tech' || def.id === 'desktopTech'
          if (isRepair && !bossActive(s)) {
            const needed    = partsNeeded(unit.quality)
            const available = (s.parts || 0) - partsReservedThisTick
            if (available < needed) break   // no parts → tech idles
            partsReservedThisTick += needed
            dispatch({ type: 'CONSUME_PARTS', payload: needed })
          }

          const speedMult = globalSpeedMult(s) / researchRoleMult(s, def.id)
          const sup       = unit?.supplierId ? supplierFromId(unit.supplierId) : null
          const invLvlFast = s.specials?.inventory?.hired ? (s.specials.inventory.level || 1) : 0
          const headAuditLvl = s.specials?.headAuditor?.hired ? (s.specials.headAuditor.level || 1) : 0
          const invRepairMult = isRepair ? ([1, 0.90, 0.80, 0.70][invLvlFast] || 1) : 1
          const headAuditMult = def.id === 'auditor' ? ([1, 0.75, 0.60, 0.50][headAuditLvl] || 1) : 1
          // Per-hire roles (tech): best hires fill busy slots first, so slot idx
          // busy+i maps to the sorted-desc hire for this unit.
          const slotLevel = def.perHire ? levelForSlot(worker, busy + i) : worker.level
          const supMult   =
            def.id === 'auditor' ? (sup?.auditMult || 1) * headAuditMult :
            def.id === 'cleaner' ? (sup?.cleanMult || 1) :
            1
          const dtFamilyBonus = (def.id === 'desktopTech' && ['desktop', 'aio', 'monitor'].includes(unit?.type || 'laptop')) ? 0.50 : 1
          const typeMult  = isRepair ? (unit?.repairMult || 1) * invRepairMult * dtFamilyBonus : 1
          const bonus     = isRepair ? (unit?.repairBonusMs || 0) : 0
          const jitter    = 0.85 + Math.random() * 0.30
          const duration  = Math.max(500, ((workerDuration(def.baseDuration, slotLevel) * typeMult * supMult + bonus) / speedMult) * jitter)

          claimed.add(unit.id)
          workerBusy.current[def.id] = (workerBusy.current[def.id] || 0) + 1
          setWS(ws => ({ ...ws, [def.id]: 'working' }))

          const preRolled = def.id === 'auditor'
            ? rollAuditEvents(unit.quality, s)
            : null

          setTimeout(() => {
            if (def.id === 'auditor') {
              dispatch({ type: 'COMPLETE_AUDIT', payload: { ...preRolled, unitId: unit.id } })
            } else if (isRepair) {
              const invLvl = stateRef.current.specials?.inventory?.hired ? (stateRef.current.specials.inventory.level || 1) : 0
              dispatch({ type: 'COMPLETE_REPAIR', payload: { ...rollRepairEvents(invLvl, sup?.scrapMult || 1), unitId: unit.id } })
            } else {
              dispatch({ type: def.actionType, payload: { unitId: unit.id } })
            }
            claimed.delete(unit.id)
            workerBusy.current[def.id] = Math.max(0, (workerBusy.current[def.id] || 1) - 1)
            if (workerBusy.current[def.id] === 0) {
              setWS(ws => ({ ...ws, [def.id]: 'idle' }))
            }
          }, duration)
        }
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
  function ship() {
    if (!p.packed.length) return
    dispatch({ type: 'BULK_SHIP' })
  }
  function enqueue(id) {
    setQueue(q => {
      const currentCount = q.filter(x => x === id).length
      const sp = stateRef.current.pipeline
      const cap = {
        audit:  sp.unchecked.length,
        repair: sp.unchecked.length + sp.audited.length,
        image:  sp.unchecked.length + sp.audited.length + sp.repaired.length,
        clean:  sp.unchecked.length + sp.audited.length + sp.repaired.length + sp.imaged.length,
        pack:   sp.unchecked.length + sp.audited.length + sp.repaired.length + sp.imaged.length + sp.cleaned.length,
      }[id] ?? 0
      if (currentCount >= cap) return q
      return [...q, id]
    })
  }
  function clearQueue() { setQueue([]) }

  // Queue processor — when idle, scan the queue for the first runnable
  // action. Actions whose input is empty but has upstream feed stay queued;
  // actions whose input is empty with no upstream at all get dropped.
  // Key insight: we scan past blocked items rather than only checking head,
  // so clicking buttons out of order doesn't deadlock the pipeline.
  useEffect(() => {
    if (working || queue.length === 0) return
    const s   = stateRef.current
    const sp  = s.pipeline
    const impls = {
      audit:  { has: sp.unchecked.length, upstream: [], run: () => {
        const u   = sp.unchecked[0]
        const sup = u.supplierId ? supplierFromId(u.supplierId) : null
        const haLvl = s.specials?.headAuditor?.hired ? (s.specials.headAuditor.level || 1) : 0
        const haMult = [1, 0.75, 0.60, 0.50][haLvl] || 1
        const dur = Math.max(500, DURATIONS.audit * (sup?.auditMult || 1) * haMult)
        const ev  = rollAuditEvents(u.quality, s)
        doAction(t('work.auditing'), dur, () => dispatch({ type: 'COMPLETE_AUDIT', payload: ev }))
      }},
      repair: { has: sp.audited.length, upstream: ['unchecked'], run: () => {
        const u      = sp.audited[0]
        const sup    = u.supplierId ? supplierFromId(u.supplierId) : null
        const needed = partsNeeded(u.quality)
        if ((s.parts || 0) < needed) {
          const msg = `Need ${needed} part${needed > 1 ? 's' : ''} to repair — order from 🛒 eBay.`
          dispatch({ type: 'ADD_LOG', payload: `❌ ${msg}` })
          setAlertToast({ msg, icon: '❌', variant: 'error', expiresAt: Date.now() + 3500 })
          return 'no-parts'
        }
        dispatch({ type: 'CONSUME_PARTS', payload: needed })
        const invLvl = s.specials?.inventory?.hired ? (s.specials.inventory.level || 1) : 0
        const repairMult = (u.repairMult || 1) * ([1, 0.90, 0.80, 0.70][invLvl] || 1)
        const dur = Math.max(500, DURATIONS.repair * repairMult + (u.repairBonusMs || 0))
        doAction(t('work.repairing'), dur, () => dispatch({ type: 'COMPLETE_REPAIR', payload: rollRepairEvents(invLvl, sup?.scrapMult || 1) }))
      }},
      image:  { has: sp.repaired.length, upstream: ['unchecked', 'audited'], run: () => {
        const dur = DURATIONS.image + (sp.repaired[0].imageBonusMs || 0)
        doAction(t('work.imaging'), dur, () => dispatch({ type: 'COMPLETE_IMAGE' }))
      }},
      clean:  { has: sp.imaged.length, upstream: ['unchecked', 'audited', 'repaired'], run: () => {
        const u   = sp.imaged[0]
        const sup = u.supplierId ? supplierFromId(u.supplierId) : null
        const dur = Math.max(500, DURATIONS.clean * (sup?.cleanMult || 1))
        doAction(t('work.cleaning'), dur, () => dispatch({ type: 'COMPLETE_CLEAN' }))
      }},
      pack:   { has: sp.cleaned.length, upstream: ['unchecked', 'audited', 'repaired', 'imaged'], run: () => {
        doAction(t('work.packing'), DURATIONS.pack, () => dispatch({ type: 'COMPLETE_PACK' }))
      }},
    }
    // Find the first item in the queue that can actually run.
    let runIdx = -1
    const toDrop = new Set()
    for (let i = 0; i < queue.length; i++) {
      const impl = impls[queue[i]]
      if (!impl) { toDrop.add(i); continue }
      if (impl.has) { runIdx = i; break }
      const anyUpstream = impl.upstream.some(k => sp[k]?.length > 0)
      if (!anyUpstream) toDrop.add(i)
      // else keep in queue waiting for upstream to flow
    }
    if (runIdx >= 0) {
      const id   = queue[runIdx]
      const impl = impls[id]
      // Remove runIdx + any dropped items above it
      setQueue(q => q.filter((_, i) => i !== runIdx && !toDrop.has(i)))
      const result = impl.run()
      // If repair couldn't start due to no parts, the item is still removed
      // (dropped above). Next effect tick tries again with whatever's next.
      if (result === 'no-parts') return
      return
    }
    // Nothing runnable; just prune dead items and wait for state change.
    if (toDrop.size > 0) setQueue(q => q.filter((_, i) => !toDrop.has(i)))
  }, [working, queue, state])

  // ── Derived ───────────────────────────────────────────────────────────────
  const netProfit  = state.totalEarned - state.totalSpent
  const totalUnits = Object.values(p).reduce((s, a) => s + a.length, 0)
  const broke      = state.money < 3 && totalUnits === 0
  const expansion  = currentExpansion(state)
  const nextExp    = nextExpansion(state)

  const STAGES = [
    { key: 'unchecked', label: t('pipe.toAudit'),  icon: '📥', color: '#8892a4' },
    { key: 'audited',   label: t('pipe.toRepair'), icon: '🔧', color: '#f39c12' },
    { key: 'repaired',  label: t('pipe.toImage'),  icon: '💿', color: '#3498db' },
    { key: 'imaged',    label: t('pipe.toClean'),  icon: '🧹', color: '#9b59b6' },
    { key: 'cleaned',   label: t('pipe.toPack'),   icon: '📦', color: '#2ecc71' },
    { key: 'packed',    label: t('pipe.ready'),    icon: '🚚', color: '#e67e22' },
  ]

  const isAuto = id => (w?.[id]?.count || 0) > 0

  // action id → worker def (so action buttons can show auto speed/status)
  const ACTION_TO_WORKER = { audit: 'auditor', repair: 'tech', image: 'imager', clean: 'cleaner', pack: 'packer' }
  const autoDesc = (actionId, inputLen) => {
    const workerId = ACTION_TO_WORKER[actionId]
    const def      = WORKER_DEFS.find(d => d.id === workerId)
    const worker   = w[workerId]
    if (!def || (worker?.count || 0) < 1) return null
    const speedMult = globalSpeedMult(state) / researchRoleMult(state, def.id)
    const dur       = Math.max(500, workerDuration(def.baseDuration, workerLevel(worker)) / speedMult)
    const secs      = (dur / 1000).toFixed(1)
    const crewTag   = worker.count > 1 ? ` ×${worker.count}` : ''
    return `🤖${crewTag} ${secs}s/unit · ${inputLen} waiting`
  }

  const qCount = id => queue.filter(q => q === id).length

  // Max queueable per action: count of units anywhere from the input stage upstream.
  // Caps over-clicking so you can't queue more than the pipeline could possibly feed.
  const caps = {
    audit:  p.unchecked.length,
    repair: p.unchecked.length + p.audited.length,
    image:  p.unchecked.length + p.audited.length + p.repaired.length,
    clean:  p.unchecked.length + p.audited.length + p.repaired.length + p.imaged.length,
    pack:   p.unchecked.length + p.audited.length + p.repaired.length + p.imaged.length + p.cleaned.length,
  }
  const qAllowed = id => caps[id] - qCount(id)

  const ACTIONS = [
    { id: 'buy',    label: t('action.buy'),  desc: t('action.buyDesc'), fn: buy, off: false },
    { id: 'audit',  label: t('action.audit'),  autoOn: isAuto('auditor'), workerId: 'auditor', desc: isAuto('auditor') ? autoDesc('audit',  p.unchecked.length) : `${p.unchecked.length} ${t('action.autoWaiting')}`, fn: () => enqueue('audit'),  off: isAuto('auditor') || qAllowed('audit')  <= 0 },
    { id: 'repair', label: t('action.repair'), autoOn: isAuto('tech') || isAuto('desktopTech'), workerId: 'tech', desc: (isAuto('tech') || isAuto('desktopTech')) ? autoDesc('repair', p.audited.length) : `${p.audited.length} ${t('action.autoWaiting')}`, fn: () => enqueue('repair'), off: isAuto('tech') || isAuto('desktopTech') || qAllowed('repair') <= 0 },
    { id: 'image',  label: t('action.image'),  autoOn: isAuto('imager'),  workerId: 'imager',  desc: isAuto('imager')  ? autoDesc('image',  p.repaired.length)  : `${p.repaired.length} ${t('action.autoWaiting')}`,  fn: () => enqueue('image'),  off: isAuto('imager')  || qAllowed('image')  <= 0 },
    { id: 'clean',  label: t('action.clean'),  autoOn: isAuto('cleaner'), workerId: 'cleaner', desc: isAuto('cleaner') ? autoDesc('clean',  p.imaged.length)    : `${p.imaged.length} ${t('action.autoWaiting')}`,    fn: () => enqueue('clean'),  off: isAuto('cleaner') || qAllowed('clean')  <= 0 },
    { id: 'pack',   label: t('action.pack'),   autoOn: isAuto('packer'),  workerId: 'packer',  desc: isAuto('packer')  ? autoDesc('pack',   p.cleaned.length)   : `${p.cleaned.length} ${t('action.autoWaiting')}`,   fn: () => enqueue('pack'),   off: isAuto('packer')  || qAllowed('pack')   <= 0 },
    { id: 'ship',   label: `${t('action.ship')}${p.packed.length > 1 ? ` ${t('action.shipAllN').split('{n}').join(p.packed.length)}` : ''}`, desc: `${p.packed.length} ${t('action.ready')}`, fn: ship, off: !p.packed.length, full: true },
  ]

  // All pipeline stages staffed → hide manual action UI so the game feels calm.
  // Repair is covered if either tech or desktopTech is hired.
  const allStaffed = (w.auditor?.count || 0) > 0
    && ((w.tech?.count || 0) > 0 || (w.desktopTech?.count || 0) > 0)
    && (w.imager?.count  || 0) > 0
    && (w.cleaner?.count || 0) > 0
    && (w.packer?.count  || 0) > 0

  // Safety net: if every stage is staffed, drop any leftover manual work/queue.
  useEffect(() => {
    if (!allStaffed) return
    if (working) { clearInterval(tickRef.current); clearTimeout(timerRef.current); setWorking(null) }
    if (queue.length > 0) setQueue([])
  }, [allStaffed])

  const shopBadge = WORKER_DEFS.some(d => {
    if (!workerStageUnlocked(d, state)) return false
    const wk = w[d.id] || { count: 0 }
    const max = workerMaxCount(d, state)
    if (wk.count >= max) return false
    return state.money >= workerHireCost(d, wk.count, state)
  })
  const contractsTabVisible = contractsFeatureVisible(state)
  const salesMgrHired = !!state.specials?.sales?.hired
  const activeBuffsList = activeBuffs(state, tickNow)

  return (
    <div className={`app stage-${state.expansionStage || 'garage'}`}>

      <header className="topbar">
        <div className="tb-row tb-row-1">
          <div className="brand">{t('brand')}</div>
          <div className="tb-stage">
            <span className="tbs-icon">{expansion.icon}</span>
            <span className="tbs-label">{expansion.label}</span>
            {(() => {
              const ready = expansionReady(state)
              if (!ready) return null
              const afford = canAffordExpansion(state)
              return (
                <button
                  className={`tbs-upgrade${afford ? '' : ' dim'}`}
                  onClick={() => setExpandModal(true)}
                  title={tf('expand.cta', { label: ready.label, cost: ready.cost.toLocaleString() })}
                >
                  ↗ ${ready.cost.toLocaleString()}
                </button>
              )
            })()}
          </div>
          <button
            className="lang-toggle"
            onClick={() => dispatch({ type: 'SET_LANG', payload: lang === 'en' ? 'es' : 'en' })}
            title={t('lang.toggle')}
            aria-label={t('lang.toggle')}
          >
            {lang === 'en' ? '🇺🇸 EN' : '🇪🇸 ES'}
          </button>
        </div>
        <div className="tb-row tb-row-2">
          <div className="chips">
            <Chip icon="💵" label={t('chip.cash')}   val={`$${state.money.toLocaleString()}`} />
            <Chip icon="📈" label={t('chip.profit')} val={`$${netProfit.toLocaleString()}`} accent={netProfit > 0 ? 'green' : netProfit < 0 ? 'red' : ''} />
            <Chip icon="🔩" label={t('chip.parts')}  val={state.parts || 0} accent={(state.parts || 0) === 0 && p.audited.length > 0 ? 'red' : ''} />
            <Chip icon="✅" label={t('chip.sold')}   val={state.sold} />
            {(state.reputation || 0) > 0 && (
              <Chip icon="🎖️" label={t('chip.rep')} val={state.reputation} />
            )}
            {payrollUnlocked(state) && (() => {
              const due    = wageDue(state)
              const nextAt = (state.lastPayrollAt || tickNow) + PAYROLL_INTERVAL_MS
              const secs   = Math.max(0, Math.ceil((nextAt - tickNow) / 1000))
              const mm     = Math.floor(secs / 60)
              const ss     = String(secs % 60).padStart(2, '0')
              const short  = Date.now() < nextAt && state.money < due
              return (
                <Chip
                  icon="💵"
                  label={t('chip.payroll')}
                  val={`$${due.toLocaleString()} · ${mm}:${ss}`}
                  accent={short ? 'red' : ''}
                />
              )
            })()}
          </div>
        </div>
      </header>

      {(() => {
        const shops = allShops(state)
        if (shops.length <= 1) return null
        return (
          <div className="shop-switcher">
            {shops.map(sh => {
              const active = sh.id === state.activeShopId
              const stage = EXPANSION_STAGES.find(e => e.id === sh.expansionStage) || EXPANSION_STAGES[0]
              return (
                <button
                  key={sh.id}
                  className={`shop-tab ${active ? 'active' : ''}`}
                  onClick={() => !active && dispatch({ type: 'SWITCH_SHOP', payload: sh.id })}
                  title={`${sh.name} · ${stage.label}`}
                >
                  <span className="st-icon">{sh.icon}</span>
                  <span className="st-name">{sh.name}</span>
                  <span className="st-meta">{stage.label}</span>
                </button>
              )
            })}
          </div>
        )
      })()}

      {(() => {
        const lots  = state.lotsIncoming  || []
        const parts = state.partsIncoming || []
        if (lots.length === 0 && parts.length === 0) return null
        const lotQty    = lots.reduce((n, o) => n + o.qty, 0)
        const partQty   = parts.reduce((n, o) => n + o.qty, 0)
        const nextLot   = lots.length  ? Math.min(...lots.map(o => o.arriveAt))  : null
        const nextParts = parts.length ? Math.min(...parts.map(o => o.arriveAt)) : null
        const fmt = t => {
          const s = Math.max(0, Math.ceil((t - tickNow) / 1000))
          return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`
        }
        return (
          <div className="incoming-strip">
            <span className="is-label">⏳ Incoming</span>
            {lots.length > 0 && (
              <span className="is-pill">
                📦 ×{lotQty} unit{lotQty === 1 ? '' : 's'} · next {fmt(nextLot)}
              </span>
            )}
            {parts.length > 0 && (
              <span className="is-pill">
                🔩 ×{partQty} part{partQty === 1 ? '' : 's'} · next {fmt(nextParts)}
              </span>
            )}
          </div>
        )
      })()}

      {(() => {
        const parts       = state.parts || 0
        const techCount   = (state.workers?.tech?.count || 0) + (state.workers?.desktopTech?.count || 0)
        const waiting     = p.audited.length
        const incomingQty = (state.partsIncoming || []).reduce((n, o) => n + o.qty, 0)
        if (parts > 0 || techCount === 0 || waiting === 0) return null
        return (
          <div className="parts-out-banner">
            <span className="pob-icon">🔩</span>
            <span className="pob-msg">
              <b>No parts!</b> {techCount} tech{techCount > 1 ? 's' : ''} idle · {waiting} unit{waiting > 1 ? 's' : ''} waiting to repair
            </span>
            {incomingQty > 0
              ? <span className="pob-eta">⏳ {incomingQty} incoming</span>
              : <button className="pob-cta" onClick={() => setTab('shop')}>Order parts →</button>}
          </div>
        )
      })()}

      {(() => {
        const active    = bossActive(state, tickNow)
        const cd        = bossCooldownLeft(state, tickNow)
        const ready     = bossReady(state, tickNow)
        const burstLeft = active ? Math.max(0, Math.ceil(((state.bossUntil || 0) - tickNow) / 1000)) : 0
        const cdLeft    = Math.ceil(cd / 1000)
        const bossLabel = active ? `${burstLeft}s` : ready ? 'BOSS' : `${Math.floor(cdLeft/60)}:${String(cdLeft%60).padStart(2,'0')}`
        const bossCls   = active ? 'act-btn boss burning' : ready ? 'act-btn boss ready' : 'act-btn boss cooling'
        const packedN   = p.packed.length
        return (
          <div className="action-dock">
            <button
              className={`act-btn ship${packedN > 0 ? ' hot' : ' dim'}`}
              disabled={packedN === 0}
              onClick={() => packedN > 0 && ship()}
              title={packedN > 0 ? t('dock.ship.title') : t('dock.ship.none')}
            >
              <span className="ab-icon">🚚</span>
              <span className="ab-label">{t('dock.ship')}</span>
              <span className="ab-val">{packedN}</span>
            </button>
            <button
              className={bossCls}
              disabled={!ready}
              onClick={() => ready && dispatch({ type: 'BOSS_MODE_START' })}
              title={t('dock.boss.title')}
            >
              <span className="ab-icon">💪</span>
              <span className="ab-label">{active ? t('dock.boss.active') : t('dock.boss')}</span>
              <span className="ab-val">{bossLabel}</span>
            </button>
            <button
              className="act-btn shop"
              onClick={() => setTab('shop')}
              title={t('dock.shop.title')}
            >
              <span className="ab-icon">🛒</span>
              <span className="ab-label">{t('dock.shop')}</span>
              <span className="ab-val">🔩{state.parts || 0}</span>
            </button>
          </div>
        )
      })()}

      {state.activeEvent && !eventOpen && (() => {
        const ev = DECISION_EVENTS.find(e => e.id === state.activeEvent)
        if (!ev) return null
        const startedAt = state.activeEventAt || tickNow
        const elapsed = Math.max(0, tickNow - startedAt)
        const secsLeft = Math.max(0, Math.ceil((60_000 - elapsed) / 1000))
        const pctLeft = Math.max(0, Math.min(100, 100 - (elapsed / 60_000) * 100))
        return (
          <div className="event-dock">
            <button className="event-chip" onClick={() => setEventOpen(true)}>
              <span className="ec-icon">{ev.icon}</span>
              <span className="ec-body">
                <span className="ec-title">{t('event.' + ev.id + '.title')}</span>
                <span className="ec-sub">{t('event.tapDecide')} · {secsLeft}s {t('contracts.left')}</span>
              </span>
              <span className="ec-timer"><span className="ec-timer-fill" style={{ width: `${pctLeft}%` }} /></span>
            </button>
          </div>
        )
      })()}

      {moraleUnlocked(state) && (() => {
        const m = Math.max(0, Math.min(100, state.morale ?? 60))
        const band = m >= 85 ? 'amped' : m >= 65 ? 'high' : m >= 45 ? 'mid' : m >= 25 ? 'low' : 'tanked'
        return (
          <div className={`morale-bar band-${band}`}>
            <span className="mb-face">{moraleFace(m)}</span>
            <span className="mb-label">{t('morale.label')}</span>
            <div className="mb-track"><div className="mb-fill" style={{ width: `${m}%` }} /></div>
            <span className="mb-val">{m}</span>
          </div>
        )
      })()}

      {activeBuffsList.length > 0 && (
        <div className="buff-bar">
          {activeBuffsList.map(b => {
            const secs = Math.max(0, Math.round((b.expiresAt - tickNow) / 1000))
            const mm = Math.floor(secs / 60)
            const ss = String(secs % 60).padStart(2, '0')
            const isBuff = (b.effect?.mult || 1) >= 1
            return (
              <div key={b.id} className={`buff-pill ${isBuff ? 'buff' : 'debuff'}`}>
                <span className="bp-icon">{b.icon}</span>
                <span className="bp-label">{b.label}</span>
                <span className="bp-time">{mm}:{ss}</span>
              </div>
            )
          })}
        </div>
      )}

      <div className="content">

        {/* Pipeline */}
        <section className="section pipeline-section">
          <div className="pipeline">
            {STAGES.map(s => {
              const count      = p[s.key].length
              const bottleneck = count >= 5
              const next       = count > 0 ? p[s.key][0] : null
              const incoming   = s.key === 'unchecked' ? (p.incoming?.length || 0) : 0
              // Map pipeline stage → manual action id. 'packed' ships directly.
              const stageAction = { unchecked: 'audit', audited: 'repair', repaired: 'image', imaged: 'clean', cleaned: 'pack' }[s.key]
              const actionAutoHandled = stageAction && {
                audit: isAuto('auditor'),
                repair: isAuto('tech') || isAuto('desktopTech'),
                image: isAuto('imager'),
                clean: isAuto('cleaner'),
                pack: isAuto('packer'),
              }[stageAction]
              const clickable  = count > 0 && ((s.key === 'packed') || (stageAction && !actionAutoHandled))
              const onTileClick = !clickable ? undefined
                : s.key === 'packed' ? ship
                : () => { enqueue(stageAction); if (tab !== 'actions') setTab('actions') }
              const tileTitle = !clickable ? undefined
                : s.key === 'packed' ? t('pipe.clickShipAll')
                : tf('pipe.clickDo', { action: t('action.' + stageAction) })
              return (
                <div
                  key={s.key}
                  className={`ps-box${bottleneck ? ' bottleneck' : ''}${clickable ? ' ps-clickable' : ''}`}
                  style={{ '--c': s.color }}
                  onClick={onTileClick}
                  title={tileTitle}
                >
                  <div className="ps-icon">{s.icon}</div>
                  <div className="ps-count">{count}</div>
                  <div className="ps-label">{s.label}</div>
                  {clickable && <div className="ps-ship-hint">{s.key === 'packed' ? t('pipe.clickShip') : t('action.' + stageAction)}</div>}
                  {next && (
                    <div className="ps-dot" style={{ color: QUALITY_INFO[next.quality].color }}>
                      {typeInfo(next.type || 'laptop').icon}<span className="ps-qdot">●</span>
                    </div>
                  )}
                  {incoming > 0 && <div className="ps-incoming">⬇ {incoming}</div>}
                  {bottleneck && <div className="bottleneck-tag">{t('pipe.backlog')}</div>}
                </div>
              )
            })}
          </div>
          {(() => {
            const mix = {}
            for (const arr of Object.values(p)) for (const u of arr) { const t = u.type || 'laptop'; mix[t] = (mix[t] || 0) + 1 }
            const entries = Object.entries(mix).sort((a, b) => b[1] - a[1])
            if (!entries.length) return null
            return (
              <div className="pipeline-mix">
                {(() => {
                  const mgrAuto = !!(state.specials?.manager?.hired && activeContractsList(state).length > 0 && state.priorityType)
                  let label
                  if (mgrAuto) label = t('pipe.mgr')
                  else if (state.priorityType) label = t('pipe.pinned')
                  else label = t('pipe.inPipe')
                  return <span className={`pm-label${mgrAuto ? ' mgr' : ''}`}>{label}:</span>
                })()}
                {entries.map(([ty, n]) => {
                  const active = state.priorityType === ty
                  const tyLabel = t('device.' + ty + '.label')
                  return (
                    <button
                      key={ty}
                      className={`pm-chip${active ? ' active' : ''}`}
                      title={active
                        ? tf('pipe.prioOn', { label: tyLabel })
                        : tf('pipe.prioOff', { label: tyLabel })}
                      onClick={() => dispatch({ type: 'PRIORITIZE_TYPE', payload: ty })}
                    >
                      {typeInfo(ty).icon}<span className="pm-n">×{n}</span>
                      {active && <span className="pm-pin">📌</span>}
                    </button>
                  )
                })}
              </div>
            )
          })()}
        </section>

        {/* Scrap Bin — collapsed chip by default, expand to process */}
        {(p.scrapped?.length || 0) > 0 && (() => {
          const pile       = p.scrapped
          const n          = pile.length
          const partsYield = n * SCRAP_PART_YIELD
          const junkCash   = n * SCRAP_JUNK_PER_UNIT
          const ebayCash   = pile.reduce((sum, u) => sum + Math.round((u.sellPrice || 0) * SCRAP_EBAY_MULT), 0)
          const ebayOk     = scrapEbayUnlocked(state)
          return (
            <section className={`scrap-bin${scrapOpen ? ' open' : ' closed'}`}>
              <button
                className="scrap-head"
                onClick={() => setScrapOpen(o => !o)}
                title={scrapOpen ? t('scrap.collapse') : t('scrap.expand')}
              >
                <span className="scrap-icon">🗑️</span>
                <span className="scrap-label">{t('scrap.title')}</span>
                <span className="scrap-count">×{n}</span>
                <span className="scrap-chevron">{scrapOpen ? '▾' : '▸'}</span>
              </button>
              {scrapOpen && (
                <div className="scrap-actions">
                  <button className="scrap-btn" onClick={() => dispatch({ type: 'SCRAP_PART_OUT' })}>
                    🔩 {t('scrap.partOut')} <span className="sb-sub">+{partsYield}</span>
                  </button>
                  <button className="scrap-btn" onClick={() => dispatch({ type: 'SCRAP_SELL_JUNK' })}>
                    💵 {t('scrap.sellJunk')} <span className="sb-sub">+${junkCash}</span>
                  </button>
                  <button
                    className={`scrap-btn${ebayOk ? '' : ' dim'}`}
                    disabled={!ebayOk}
                    onClick={() => dispatch({ type: 'SCRAP_SELL_EBAY' })}
                    title={ebayOk ? t('scrap.ebayTitle') : t('scrap.ebayUnlockHint')}
                  >
                    📦 {t('scrap.sellEbay')} <span className="sb-sub">{ebayOk ? `+$${ebayCash}` : '🔒'}</span>
                  </button>
                </div>
              )}
            </section>
          )
        })()}

        {/* Expansion progress */}
        {nextExp && (() => {
          const ready = expansionReady(state)
          const afford = canAffordExpansion(state)
          if (ready) {
            return (
              <button
                className={`expansion-bar ready${afford ? '' : ' short'}`}
                onClick={() => setExpandModal(true)}
                title={tf('expand.cta', { label: ready.label, cost: ready.cost.toLocaleString() })}
              >
                <span className="exp-label">{expansion.icon} {expansion.label}</span>
                <span className="exp-ready-tag">
                  ↗ {tf('expand.readyCta', { label: ready.label, cost: ready.cost.toLocaleString() })}
                </span>
              </button>
            )
          }
          // Progress toward next tier is stage-anchored: sold-at-current-stage / (delta between tiers).
          const xp = expansionXpProgress(state)
          const pct = xp.need > 0 ? Math.min(100, (xp.have / xp.need) * 100) : 0
          return (
            <div className="expansion-bar">
              <span className="exp-label">{expansion.icon} {expansion.label}</span>
              <div className="exp-track">
                <div className="exp-fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="exp-next">{xp.have}/{xp.need} → {nextExp.icon} {nextExp.label}</span>
            </div>
          )
        })()}

        {/* Event log — collapsed to a single-row drawer toggle. The full log
            opens in a modal when tapped. Keeps the main screen calm; toasts
            handle "in-the-moment" alerts. */}
        <button className="log-drawer" onClick={() => setLogOpen(true)} title={t('log.showFull')}>
          <span className="ld-icon">📋</span>
          <span className="ld-label">{t('log.title')}</span>
          <span className="ld-count">{state.log.length}</span>
          <span className="ld-expand">⤢</span>
        </button>

        {/* Manual action progress / queue indicator — hidden when floor is fully staffed */}
        {!allStaffed && (working || queue.length > 0) && (
          <div className="prog-bar">
            {working ? (
              <>
                <span className="prog-label">{working.label}…</span>
                <div className="prog-track">
                  <div className="prog-fill" style={{ width: `${working.progress}%` }} />
                </div>
                <span className="prog-pct">{Math.round(working.progress)}%</span>
              </>
            ) : (
              <span className="prog-label">{t('queue.waiting')}</span>
            )}
            {queue.length > 0 && (
              <>
                <span className="prog-queue">{queue.length} {t('queue.queued')}</span>
                <button className="prog-clear" onClick={clearQueue} title={t('queue.clear')}>✕</button>
              </>
            )}
          </div>
        )}

        {/* Tab bar */}
        <div className="tabs">
          <button className={`tab-btn${tab === 'actions' ? ' active' : ''}`} onClick={() => setTab('actions')}>
            {t('tab.actions')}
          </button>
          <button className={`tab-btn${tab === 'shop' ? ' active' : ''}`} onClick={() => setTab('shop')}>
            {t('tab.shop')} {shopBadge && <span className="tab-badge">!</span>}
          </button>
          {contractsTabVisible && (
            <button className={`tab-btn${tab === 'contracts' ? ' active' : ''}`} onClick={() => setTab('contracts')}>
              {t('tab.contracts')} {activeContractsList(state).length > 0 && <span className="tab-badge live">{activeContractsList(state).length > 1 ? activeContractsList(state).length : '●'}</span>}
            </button>
          )}
          <button className={`tab-btn${tab === 'milestones' ? ' active' : ''}`} onClick={() => { setTab('milestones'); setNM(false) }}>
            {t('tab.milestones')} {(() => {
              const pending = state.unclaimedMilestones?.length || 0
              if (pending > 0) return <span className={`tab-badge gift${newMilestone ? ' flash' : ''}`} title={t('ms.summary.ready')}>🎁{pending}</span>
              if (state.earned.length > 0) return <span className="tab-badge">{state.earned.length}</span>
              return null
            })()}
          </button>
          <button className={`tab-btn${tab === 'stats' ? ' active' : ''}`} onClick={() => setTab('stats')}>
            {t('tab.stats')}
          </button>
        </div>

        {/* Actions panel */}
        {tab === 'actions' && (
          <div className="actions-wrap">
            <div className="strip-label">
              {t('action.sellOn')}
              <button
                className={`autoship-toggle${state.autoShip ? ' on' : ''}`}
                onClick={() => dispatch({ type: 'SET_AUTO_SHIP', payload: !state.autoShip })}
                title={state.autoShip ? t('autoship.onTitle') : t('autoship.offTitle')}
              >
                <span className="ats-dot" />
                {state.autoShip ? t('autoship.on') : t('autoship.off')}
              </button>
            </div>
            <div className="supplier-strip">
              {CHANNELS.map(ch => {
                const unlocked = channelUnlocked(ch, state)
                const active = state.activeChannel === ch.id
                return (
                  <button
                    key={ch.id}
                    className={`sup-pill${active ? ' active' : ''}${unlocked ? '' : ' locked'}`}
                    onClick={() => unlocked && dispatch({ type: 'SET_CHANNEL', payload: ch.id })}
                    disabled={!unlocked}
                    title={unlocked ? t('channel.' + ch.id + '.desc') : ch.unlockStage
                      ? tf('shop.stageLocked', { stage: t('stage.' + ch.unlockStage + '.label') })
                      : tf('shop.workerLocked', { n: ch.unlockSold, left: Math.max(0, ch.unlockSold - state.sold) })}
                  >
                    {ch.icon} {t('channel.' + ch.id + '.label')}
                    {unlocked
                      ? <span className={ch.feePct > 0.15 ? 'pill-more' : 'pill-less'}>{Math.round(ch.feePct * 100)}% {t('unlock.fee')}</span>
                      : <span className="pill-lock">🔒</span>}
                  </button>
                )
              })}
            </div>
          {allStaffed ? (
            <div className="actions-auto">
              <div className="actions-auto-note">
                <span className="aa-dot">●</span>
                <span>Floor running — workers are handling every stage.</span>
              </div>
              {(() => {
                const ship = ACTIONS.find(a => a.id === 'ship')
                return (
                  <button
                    className={`action-btn full${ship.off ? ' dim' : ''}`}
                    onClick={ship.fn}
                    disabled={ship.off}
                  >
                    <div className="action-label">{ship.label}</div>
                    <div className="action-desc">{ship.desc}</div>
                  </button>
                )
              })()}
            </div>
          ) : (
            <div className="actions-grid">
              {ACTIONS.map(a => {
                const n = a.id !== 'buy' && a.id !== 'ship' ? qCount(a.id) : 0
                return (
                  <button
                    key={a.id}
                    className={`action-btn${a.off && !a.autoOn ? ' dim' : ''}${a.full ? ' full' : ''}${a.autoOn ? ' auto' : ''}`}
                    onClick={a.fn}
                    disabled={a.off}
                  >
                    {n > 0 && <span className="action-qbadge">×{n}</span>}
                    {a.autoOn && <span className="auto-dot">●</span>}
                    <div className="action-label">{a.label}</div>
                    <div className="action-desc">{a.desc}</div>
                  </button>
                )
              })}
            </div>
          )}
          </div>
        )}

        {/* Shop panel */}
        {tab === 'shop' && (
          <div className="shop">

            <div className="shop-subtabs">
              <button className={`shop-subtab${shopTab === 'buy' ? ' active' : ''}`} onClick={() => setShopTab('buy')}>{t('shop.sub.buy')}</button>
              <button className={`shop-subtab${shopTab === 'hire' ? ' active' : ''}`} onClick={() => setShopTab('hire')}>{t('shop.sub.hire')}</button>
              <button className={`shop-subtab${shopTab === 'facilities' ? ' active' : ''}`} onClick={() => setShopTab('facilities')}>{t('shop.sub.facilities')}</button>
              <button className={`shop-subtab${shopTab === 'research' ? ' active' : ''}`} onClick={() => setShopTab('research')}>{t('shop.sub.research')}</button>
            </div>

            {shopTab === 'buy' && <>
            {/* Loads — active purchases, grouped by lot + supplier */}
            {(() => {
              const lots = state.lots || []
              const byLot = {}
              for (const arr of Object.entries(p)) {
                const [stage, units] = arr
                for (const u of units) {
                  if (!u?.lotId) continue
                  const e = byLot[u.lotId] || { stages: {}, total: 0 }
                  e.stages[stage] = (e.stages[stage] || 0) + 1
                  e.total += 1
                  byLot[u.lotId] = e
                }
              }
              const activeLots = lots.filter(l => byLot[l.id])
              const vendorStats = state.vendorStats || {}
              const vendorEntries = Object.entries(vendorStats).filter(([, v]) => (v.bought || 0) > 0)
              const fmtAgo = ts => {
                const s = Math.max(0, Math.round((tickNow - ts) / 1000))
                if (s < 60) return `${s}${t('time.secAgo')}`
                const m = Math.floor(s / 60); if (m < 60) return `${m}${t('time.minAgo')}`
                const h = Math.floor(m / 60); return `${h}${t('time.hourAgo')}`
              }
              const stagePlan = [
                { k: 'incoming',  icon: '⬇',  label: t('loads.unloading') },
                { k: 'unchecked', icon: '🔍', label: t('loads.stage.audit') },
                { k: 'audited',   icon: '🔧', label: t('loads.stage.repair') },
                { k: 'repaired',  icon: '💿', label: t('loads.stage.image') },
                { k: 'imaged',    icon: '🧹', label: t('loads.stage.clean') },
                { k: 'cleaned',   icon: '📦', label: t('loads.stage.pack') },
                { k: 'packed',    icon: '✅', label: t('loads.ready') },
                { k: 'scrapped',  icon: '🗑️', label: t('loads.scrap') },
              ]
              // Always show the panel (empty state guides the player)
              const pendingShipments = (state.lotsIncoming || [])
              // Group pending shipments by supplier so spam-buyers see one row per vendor
              const shipGroups = {}
              for (const sh of pendingShipments) {
                const g = shipGroups[sh.supplierId] || { supplierIcon: sh.supplierIcon, supplierLabel: sh.supplierLabel, count: 0, qty: 0, nextArrive: Infinity }
                g.count += 1
                g.qty += sh.qty
                if (sh.arriveAt < g.nextArrive) g.nextArrive = sh.arriveAt
                shipGroups[sh.supplierId] = g
              }
              const groupEntries = Object.entries(shipGroups)
              // Count units across active lots (in pipeline) + pending shipments (in transit)
              const activeUnits  = activeLots.reduce((n, l) => {
                const inPipe = byLot[l.id]?.total || 0
                return n + inPipe
              }, 0)
              const pendingUnits = pendingShipments.reduce((n, o) => n + o.qty, 0)
              const totalUnits   = activeUnits + pendingUnits
              const orderCount   = activeLots.length + pendingShipments.length
              return (
                <div className="loads-panel">
                  <div className="lp-head">
                    <span className="lp-title">{t('loads.title')}</span>
                    <span className="lp-total" title={`${orderCount} ${orderCount === 1 ? t('loads.order') : t('loads.orders')}`}>
                      ×{totalUnits} {totalUnits === 1 ? t('loads.unit') : t('loads.units')}
                    </span>
                  </div>
                  {groupEntries.length > 0 && (
                    <div className="lp-shipments">
                      {groupEntries.map(([sid, g]) => {
                        const secs = Math.max(0, Math.ceil((g.nextArrive - tickNow) / 1000))
                        return (
                          <div key={sid} className="shipment-row">
                            <span className="ship-sup">{g.supplierIcon} {g.supplierLabel}{g.count > 1 ? ` ×${g.count} ${t('loads.shipments')}` : ''}</span>
                            <span className="ship-qty">×{g.qty} {t('loads.units')}</span>
                            <span className="ship-eta">{t('loads.nextIn')} {secs}s</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {(() => {
                    if (activeLots.length === 0 && pendingShipments.length === 0)
                      return <div className="lp-empty">{t('loads.empty')}</div>
                    if (activeLots.length === 0) return null
                    // Group active lots by supplier when 2+ from same vendor are live, so the panel stays compact.
                    const bySup = {}
                    for (const lot of activeLots) {
                      const g = bySup[lot.supplierId] || { lots: [], supplierIcon: lot.supplierIcon, supplierLabel: lot.supplierLabel, totalQty: 0, totalCost: 0, stages: {}, earliest: Infinity }
                      g.lots.push(lot)
                      g.totalQty  += lot.qty
                      g.totalCost += lot.cost
                      if (lot.purchasedAt < g.earliest) g.earliest = lot.purchasedAt
                      const e = byLot[lot.id]
                      for (const [k, v] of Object.entries(e.stages)) g.stages[k] = (g.stages[k] || 0) + v
                      bySup[lot.supplierId] = g
                    }
                    return (
                      <div className="lp-list">
                        {Object.entries(bySup).map(([sid, g]) => {
                          const totalInPipe = Object.values(g.stages).reduce((n, v) => n + v, 0)
                          const stages = stagePlan.filter(sp => (g.stages[sp.k] || 0) > 0)
                          const packedN = g.stages.packed || 0
                          const scrapN  = g.stages.scrapped || 0
                          const progress = Math.round(((g.totalQty - totalInPipe) / g.totalQty) * 100)
                          const lotLabel = g.lots.length > 1 ? ` · ${g.lots.length} lots` : ''
                          return (
                            <div key={sid} className="lot-card">
                              <div className="lot-row1">
                                <span className="lot-sup">{g.supplierIcon} {g.supplierLabel}{lotLabel}</span>
                                <span className="lot-qty">×{g.totalQty}</span>
                                <span className="lot-cost">${g.totalCost}</span>
                                <span className="lot-age">{fmtAgo(g.earliest)}</span>
                              </div>
                              <div className="lot-progress">
                                <div className="lot-bar"><div className="lot-fill" style={{ width: `${progress}%` }} /></div>
                                <span className="lot-prog-n">{g.totalQty - totalInPipe}/{g.totalQty} {t('loads.done')}</span>
                              </div>
                              <div className="lot-stages">
                                {stages.map(sp => (
                                  <span key={sp.k} className={`lot-stage s-${sp.k}`}>
                                    {sp.icon} {g.stages[sp.k]} {sp.label}
                                  </span>
                                ))}
                                {packedN > 0 && <span className="lot-pill good">✅ {packedN} {t('loads.ready')}</span>}
                                {scrapN  > 0 && <span className="lot-pill bad">🗑️ {scrapN} {t('loads.scrap')}</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                  {vendorEntries.length > 0 && (
                    <div className="vendor-stats">
                      <div className="vs-head">{t('vendor.title')}</div>
                      <div className="vs-rows">
                        <div className="vs-row vs-hdr">
                          <span className="vs-name">{t('vendor.name')}</span>
                          <span className="vs-col">{t('vendor.orders')}</span>
                          <span className="vs-col">{t('vendor.units')}</span>
                          <span className="vs-col">{t('vendor.spent')}</span>
                          <span className="vs-col">{t('vendor.sold')}</span>
                          <span className="vs-col">{t('vendor.revenue')}</span>
                          <span className="vs-col">{t('vendor.profit')}</span>
                          <span className="vs-col">{t('vendor.scrapPct')}</span>
                        </div>
                        {vendorEntries.map(([sid, v]) => {
                          const supInfo = supplierFromId(sid)
                          const profit  = (v.revenue || 0) - (v.spent || 0)
                          const scrapPct = v.bought ? Math.round((v.scrapped || 0) / v.bought * 100) : 0
                          return (
                            <div key={sid} className="vs-row">
                              <span className="vs-name">{supInfo.icon} {supInfo.label}</span>
                              <span className="vs-col">{v.lots || 0}</span>
                              <span className="vs-col">{v.bought || 0}</span>
                              <span className="vs-col">${v.spent || 0}</span>
                              <span className="vs-col">{v.sold || 0}</span>
                              <span className="vs-col">${v.revenue || 0}</span>
                              <span className={`vs-col ${profit >= 0 ? 'pos' : 'neg'}`}>{profit >= 0 ? '+' : ''}${profit}</span>
                              <span className={`vs-col ${scrapPct >= 20 ? 'warn' : ''}`}>{scrapPct}%</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Procurement / Lot buying */}
            <div className="shop-title">{t('shop.procurement')}</div>
            <div className="shop-hint">{t('shop.procurementHint')}</div>

            {/* Supplier selector */}
            <div className="supplier-grid">
              {SUPPLIERS.filter(sup => supplierUnlocked(sup, state)).map(sup => {
                const carries = supplierCarries(sup, state.expansionStage)
                return (
                  <button
                    key={sup.id}
                    className={`supplier-btn${state.activeSupplier === sup.id ? ' active' : ''}`}
                    onClick={() => dispatch({ type: 'SET_SUPPLIER', payload: sup.id })}
                  >
                    <div className="sup-icon">{sup.icon}</div>
                    <div className="sup-name">{t('supplier.' + sup.id + '.label')}</div>
                    <div className="sup-stars">{'⭐'.repeat(sup.stars)}</div>
                    <div className="sup-desc">{t('supplier.' + sup.id + '.desc')}</div>
                    <div className="sup-inventory">
                      <div className="sup-inv-label">{t('shop.stocks')}</div>
                      <div className="sup-inv-icons">
                        {carries.map(c => <span key={c.id} title={t('device.' + c.id + '.label')}>{c.icon}</span>)}
                      </div>
                    </div>
                    <div className="sup-price">
                      {sup.priceMult > 1
                        ? <span className="sup-more">+{Math.round((sup.priceMult - 1) * 100)}% {t('shop.moreCost')}</span>
                        : sup.priceMult < 1
                        ? <span className="sup-less">-{Math.round((1 - sup.priceMult) * 100)}% {t('shop.lessCost')}</span>
                        : <span className="sup-neutral">{t('shop.standard')}</span>}
                      <span className="sup-eta">🕒 {sup.deliverySec ?? 10}s</span>
                    </div>
                    {state.specials?.headAuditor?.hired && sup.quality && (
                      <div className="sup-quality" title={t('shop.revealQuality')}>
                        🔍 <span className="sq-good">{Math.round(sup.quality.good * 100)}%</span>
                        <span className="sq-fair">{Math.round(sup.quality.fair * 100)}%</span>
                        <span className="sq-bad">{Math.round(sup.quality.bad * 100)}%</span>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Per-device purchase — pick type, then lot size */}
            {(() => {
              const sup = SUPPLIERS.find(s => s.id === state.activeSupplier) || SUPPLIERS[1]
              const carries = supplierCarries(sup, state.expansionStage)
              return (
                <div className="device-buy-grid">
                  {carries.map(d => {
                    const unitCost = estimatedBuyPrice(sup, d.id)
                    return (
                      <div key={d.id} className="device-buy-card">
                        <div className="dbc-head">
                          <span className="dbc-icon">{d.icon}</span>
                          <span className="dbc-name">{t('device.' + d.id + '.label')}</span>
                          <span className="dbc-cost">~${unitCost}/ea</span>
                        </div>
                        <div className="dbc-lots">
                          {/* Hide ×1 once bulk sizes are unlocked — no reason to buy one at a time */}
                          {expansion.lots.filter(q => q !== 1 || expansion.lots.length === 1).map(qty => {
                            const discount  = LOT_DISCOUNT[qty] || 0
                            const est       = Math.max(2, Math.round(unitCost * qty * (1 - discount)))
                            const canAfford = state.money >= est
                            return (
                              <button
                                key={qty}
                                className={`dbc-btn${canAfford ? '' : ' dim'}`}
                                disabled={!canAfford}
                                onClick={() => {
                                  if (qty === 1) dispatch({ type: 'BUY',     payload: { type: d.id } })
                                  else           dispatch({ type: 'BUY_LOT', payload: { type: d.id, qty } })
                                  const eta = sup.deliverySec ?? 10
                                  const stackKey = `buy:${sup.id}:${d.id}`
                                  const label = t('device.' + d.id + '.label')
                                  setAlertToast(prev => {
                                    const stillLive = prev && prev.stackKey === stackKey && prev.expiresAt > Date.now()
                                    const newQty = (stillLive ? prev.stackQty : 0) + qty
                                    return {
                                      stackKey,
                                      stackQty: newQty,
                                      msg: `Ordered ×${newQty} ${d.icon} ${label} — arriving in ${eta}s`,
                                      icon: sup.icon || '🚚',
                                      variant: 'success',
                                      expiresAt: Date.now() + 2800,
                                    }
                                  })
                                }}
                                title={`$${est} ${t('shop.totalLabel')}${discount ? ` (${Math.round(discount*100)}% ${t('shop.off')})` : ''}`}
                              >
                                <span className="dbc-qty">{qty === 1 ? '×1' : `×${qty}`}</span>
                                <span className="dbc-price">${est}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
            {nextExp && (
              <div className="lot-unlock-hint">
                {tf('shop.lotUnlockHint', { n: nextExp.soldNeeded - state.sold, icon: nextExp.icon, label: t('stage.' + nextExp.id + '.label') })}
              </div>
            )}

            {/* Parts inventory */}
            <div className="shop-divider" />
            <div className="shop-title">
              {t('shop.repairParts')}
              <span className="parts-count">🔩 ×{state.parts || 0}</span>
            </div>
            <div className="shop-hint">{t('shop.partsHint')}</div>
            <div className="parts-grid">
              {PART_SOURCES.map(src => {
                const unlocked = partSourceUnlocked(src, state)
                const canBuy   = unlocked && state.money >= src.cost
                return (
                  <button
                    key={src.id}
                    className={`parts-btn${canBuy ? '' : ' dim'}${unlocked ? '' : ' locked'}`}
                    disabled={!canBuy}
                    onClick={() => {
                      if (!unlocked) return
                      dispatch({ type: 'ORDER_PARTS', payload: src.id })
                      const stackKey = `parts:${src.id}`
                      const label = t('parts.' + src.id + '.label')
                      setAlertToast(prev => {
                        const stillLive = prev && prev.stackKey === stackKey && prev.expiresAt > Date.now()
                        const newQty = (stillLive ? prev.stackQty : 0) + src.qty
                        return {
                          stackKey,
                          stackQty: newQty,
                          msg: `Ordered ×${newQty} 🔩 parts from ${src.icon} ${label} — arriving in ${src.deliverySec}s`,
                          icon: src.icon || '🚚',
                          variant: 'success',
                          expiresAt: Date.now() + 2800,
                        }
                      })
                    }}
                  >
                    <div className="parts-icon">{src.icon}</div>
                    <div className="parts-name">{t('parts.' + src.id + '.label')}</div>
                    <div className="parts-stats">+{src.qty} · ${src.cost} · {src.deliverySec}s</div>
                    <div className="parts-desc">
                      {unlocked ? t('parts.' + src.id + '.desc') : tf('shop.partsLockedAt', { stage: t('stage.' + src.unlockStage + '.label') })}
                    </div>
                  </button>
                )
              })}
            </div>
            {(state.partsIncoming || []).length > 0 && (
              <div className="parts-incoming">
                {t('shop.partsInTransit')}
                {state.partsIncoming.map((o, i) => {
                  const etaSec = Math.max(0, Math.ceil((o.arriveAt - Date.now()) / 1000))
                  return (
                    <span key={i} className="parts-eta">
                      {PART_SOURCES.find(s => s.id === o.sourceId)?.icon || '🚚'} +{o.qty} ({etaSec}s)
                    </span>
                  )
                })}
              </div>
            )}
            </>}

            {shopTab === 'hire' && <>
            <div className="shop-title">{t('shop.pipelineStaff')}</div>
            {WORKER_DEFS.filter(def => workerStageUnlocked(def, state)).map(def => {
              const worker    = w[def.id] || (def.perHire ? { count: 0, level: 1, hireLevels: [] } : { count: 0, level: 1 })
              const hired     = worker.count > 0
              const maxCount  = workerMaxCount(def, state)
              const hireCost  = workerHireCost(def, worker.count, state)
              const baseLevel = workerLevel(worker)     // per-hire: lowest hire; shared: worker.level
              const maxedOut  = workerMaxLevel(worker) >= 5 && baseLevel >= 5
              const upg       = hired && !maxedOut ? upgradeCost(def, baseLevel) : null
              const gate      = hired ? upgradeGate(worker, state) : null
              const upgGated  = hired && upg !== null && gate && !gate.allowed
              const status    = workerStatus[def.id] || 'idle'
              const locked    = state.sold < (def.unlockSold || 0)
              const atCap     = worker.count >= maxCount
              const canHire   = !locked && !atCap && state.money >= hireCost
              const canUpg    = hired && upg !== null && !upgGated && state.money >= upg
              // Speed summary: use the floor level (newest/weakest hire dictates queue throughput on that slot).
              const spd       = hired ? Math.round(workerDuration(def.baseDuration, baseLevel) / 1000 * 10) / 10 : null

              return (
                <div key={def.id} className={`worker-card${hired ? ' hired' : ''}${locked ? ' locked' : ''}`}>
                  <div className="wc-icon">
                    {def.icon}
                    {worker.count > 1 && <span className="wc-count">×{worker.count}</span>}
                  </div>
                  <div className="wc-body">
                    <div className="wc-name">
                      {t('worker.' + def.id + '.label')}{worker.count > 1 ? ` ${t('shop.crew')}` : ''}
                      {hired && !def.perHire && <LevelDots level={worker.level} />}
                      {hired && def.perHire && (
                        <span className="wc-hire-levels">
                          {[...worker.hireLevels].sort((a,b) => b - a).map((lv, i) => (
                            <span key={i} className={`hl-pip hl-l${lv}`}>L{lv}</span>
                          ))}
                        </span>
                      )}
                    </div>
                    <div className="wc-desc">
                      {locked
                        ? tf('shop.workerLocked', { n: def.unlockSold, left: def.unlockSold - state.sold })
                        : t('worker.' + def.id + '.desc')}
                    </div>
                    {hired && (
                      <div className="wc-meta">
                        <span className={`wc-status ${status}`}>{status === 'working' ? t('worker.working') : t('worker.idle')}</span>
                        <span className="wc-speed">{spd}{t('shop.speedSec')}</span>
                        <span className="wc-cap">{worker.count}/{maxCount}</span>
                      </div>
                    )}
                  </div>
                  <div className="wc-btn-wrap">
                    {/* Hire button — shows even when already hired if headcount < max */}
                    {!atCap && (
                      <button
                        className={`shop-btn hire${canHire ? '' : ' dim'}`}
                        disabled={!canHire}
                        onClick={() => dispatch({ type: 'HIRE_WORKER', payload: def.id })}
                      >
                        {locked
                          ? '🔒'
                          : <>{hired ? t('shop.hirePlus') : t('shop.hireOne')}<br /><span className="shop-cost">${hireCost}</span></>}
                      </button>
                    )}
                    {atCap && hired && (
                      <div className="shop-btn dim cap-hit">
                        <span>{t('shop.crewCap').split('\n').map((p, i, arr) => <span key={i}>{p}{i < arr.length - 1 && <br />}</span>)}</span>
                      </div>
                    )}
                    {/* Upgrade button — only when already hired */}
                    {hired && (
                      <button
                        className={`shop-btn upgrade${canUpg ? '' : ' dim'}`}
                        disabled={!canUpg}
                        onClick={() => dispatch({ type: 'UPGRADE_WORKER', payload: def.id })}
                        title={upgGated
                          ? `Sell ${gate.remaining} more at L${baseLevel} to unlock`
                          : (def.perHire ? `Promotes the lowest-level hire from L${baseLevel} to L${baseLevel + 1}` : undefined)}
                      >
                        {upg
                          ? upgGated
                            ? <><span>🔒 L{baseLevel + 1}</span><br /><span className="shop-cost">{gate.since}/{gate.needed} sold</span></>
                            : <><span>{def.perHire ? 'Promote' : t('shop.level')} L{baseLevel + 1}</span><br /><span className="shop-cost">${upg}</span></>
                          : <span className="maxed">{t('shop.max')}</span>
                        }
                      </button>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Management section */}
            <div className="shop-divider" />
            <div className="shop-title">{t('shop.management')}</div>
            {SPECIAL_HIRES.map(def => {
              const sp       = state.specials?.[def.id] || { hired: false, level: 1 }
              const hireCost = specialHireCost(def, state)
              const upg      = sp.hired ? specialUpgCost(def, sp.level, state) : null
              const stageIdx = EXPANSION_STAGES.findIndex(s => s.id === def.unlockStage)
              const curIdx   = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
              const soldLocked = (def.unlockSold || 0) > state.sold
              const locked   = curIdx < stageIdx || soldLocked
              const canHire  = !sp.hired && !locked && state.money >= hireCost
              const canUpg   = sp.hired && upg !== null && state.money >= upg

              return (
                <div key={def.id} className={`worker-card${sp.hired ? ' hired' : ''}${locked ? ' locked' : ''}`}>
                  <div className="wc-icon">{def.icon}</div>
                  <div className="wc-body">
                    <div className="wc-name">
                      {t('special.' + def.id + '.label')}
                      {sp.hired && def.maxLevel > 1 && <LevelDots level={sp.level} max={def.maxLevel} />}
                    </div>
                    <div className="wc-desc">{locked
                      ? (curIdx < stageIdx
                        ? tf('shop.stageLocked', { stage: t('stage.' + EXPANSION_STAGES[stageIdx].id + '.label') })
                        : tf('shop.workerLocked', { n: def.unlockSold, left: (def.unlockSold || 0) - state.sold }))
                      : t('special.' + def.id + '.desc')}</div>
                    {sp.hired && <div className="wc-effect">{t('special.' + def.id + '.eff.' + sp.level)}</div>}
                    {sp.hired && def.id === 'manager' && sp.level >= 3 && (
                      <div className="fm-auto-mode">
                        <span className="fm-auto-label">{t('fm.autoResolve')}</span>
                        <button
                          className={`fm-mode-btn${(state.settings?.autoResolve || 'safe') === 'safe' ? ' active' : ''}`}
                          onClick={() => dispatch({ type: 'SET_AUTO_RESOLVE', payload: 'safe' })}
                        >{t('fm.safe')}</button>
                        <button
                          className={`fm-mode-btn${state.settings?.autoResolve === 'greedy' ? ' active' : ''}`}
                          onClick={() => dispatch({ type: 'SET_AUTO_RESOLVE', payload: 'greedy' })}
                        >{t('fm.greedy')}</button>
                      </div>
                    )}
                  </div>
                  <div className="wc-btn-wrap">
                    {!sp.hired ? (
                      <button
                        className={`shop-btn hire${canHire ? '' : ' dim'}`}
                        disabled={!canHire}
                        onClick={() => dispatch({ type: 'HIRE_SPECIAL', payload: def.id })}
                      >
                        {locked ? '🔒' : <>{t('shop.hireOne')}<br /><span className="shop-cost">${hireCost.toLocaleString()}</span></>}
                      </button>
                    ) : (
                      <button
                        className={`shop-btn upgrade${canUpg ? '' : ' dim'}`}
                        disabled={!canUpg}
                        onClick={() => dispatch({ type: 'UPGRADE_SPECIAL', payload: def.id })}
                      >
                        {upg
                          ? <><span>{t('shop.level')} {sp.level + 1}</span><br /><span className="shop-cost">${upg.toLocaleString()}</span></>
                          : <span className="maxed">{t('shop.max')}</span>}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            </>}

            {shopTab === 'facilities' && <>
            {/* Second-shop opener — warehouse-gated */}
            {secondShopUnlocked(state) && (() => {
              const shops = allShops(state)
              const canAfford = state.money >= SECOND_SHOP_COST
              return (
                <>
                  <div className="shop-title">{t('shop.expansion')}</div>
                  <div className="facility-grid">
                    <div className="facility-card">
                      <div className="fac-icon">🏗️</div>
                      <div className="fac-body">
                        <div className="fac-name">{t('shop.openShop')} <span className="fac-owned">{shops.length} {t('shop.shopsOpen')}</span></div>
                        <div className="fac-desc">{t('shop.openShopDesc')}</div>
                      </div>
                      <div className="fac-btn-wrap">
                        <button
                          className={`shop-btn${canAfford ? ' upgrade' : ' dim'}`}
                          disabled={!canAfford}
                          onClick={() => dispatch({ type: 'OPEN_SHOP' })}
                        >
                          {t('shop.open')}<br /><span className="shop-cost">${SECOND_SHOP_COST.toLocaleString()}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )
            })()}
            {/* Facilities section */}
            {FACILITIES.some(f => facilityUnlocked(f, state)) ? (
              <>
                <div className="shop-title">{t('shop.facilities')}</div>
                <div className="facility-grid">
                  {FACILITIES.filter(f => facilityUnlocked(f, state)).map(fac => {
                    const owned   = !!state.facilities?.[fac.id]
                    const canBuy  = !owned && state.money >= fac.cost
                    return (
                      <div key={fac.id} className={`facility-card${owned ? ' owned' : ''}`}>
                        <div className="fac-icon">{fac.icon}</div>
                        <div className="fac-body">
                          <div className="fac-name">{t('facility.' + fac.id + '.label')}{owned && <span className="fac-owned">{t('shop.installed')}</span>}</div>
                          <div className="fac-desc">{t('facility.' + fac.id + '.desc')}</div>
                        </div>
                        <div className="fac-btn-wrap">
                          {owned ? (
                            <span className="fac-done">🛠️</span>
                          ) : (
                            <button
                              className={`shop-btn${canBuy ? ' upgrade' : ' dim'}`}
                              disabled={!canBuy}
                              onClick={() => dispatch({ type: 'BUY_FACILITY', payload: fac.id })}
                            >
                              {t('shop.install')}<br /><span className="shop-cost">${fac.cost.toLocaleString()}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="lp-empty">{t('shop.facilitiesLocked')}</div>
            )}
            </>}

            {shopTab === 'research' && <>
            <div className="shop-title">
              {t('shop.research')}
              <span className="parts-count">🎖️ {state.reputation || 0} {t('shop.rep')}</span>
            </div>
            <div className="shop-hint">{t('shop.researchHint')}</div>
            {RESEARCH.some(r => researchUnlocked(r, state)) ? (
              <div className="facility-grid">
                {RESEARCH.filter(r => researchUnlocked(r, state)).map(def => {
                  const owned  = researchOwned(def.id, state)
                  const canBuy = !owned && (state.reputation || 0) >= def.cost
                  return (
                    <div key={def.id} className={`facility-card${owned ? ' owned' : ''}`}>
                      <div className="fac-icon">{def.icon}</div>
                      <div className="fac-body">
                        <div className="fac-name">{t('research.' + def.id + '.label')}{owned && <span className="fac-owned">{t('shop.researched')}</span>}</div>
                        <div className="fac-desc">{t('research.' + def.id + '.desc')}</div>
                      </div>
                      <div className="fac-btn-wrap">
                        {owned ? (
                          <span className="fac-done">🔬</span>
                        ) : (
                          <button
                            className={`shop-btn${canBuy ? ' upgrade' : ' dim'}`}
                            disabled={!canBuy}
                            onClick={() => dispatch({ type: 'UNLOCK_RESEARCH', payload: def.id })}
                          >
                            {t('shop.researchBtn')}<br /><span className="shop-cost">{def.cost} {t('shop.rep')}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="lp-empty">{t('shop.researchLocked')}</div>
            )}
            </>}
          </div>
        )}

        {/* Contracts panel */}
        {tab === 'contracts' && (
          <div className="contracts">
            <div className="ct-hint">
              {t('contracts.hint')}
            </div>

            {(() => {
              const actives = activeContractsList(state)
              const cap     = maxConcurrentContracts(state)
              if (!salesMgrHired && actives.length === 0) {
                return (
                  <div className="ct-locked">
                    🔒 <b>{t('contracts.locked')}</b> {t('contracts.lockedHead')}
                    <div className="ct-locked-sub">{t('contracts.lockedSub')}</div>
                  </div>
                )
              }
              const canAcceptMore = actives.length < cap
              const activeIds     = new Set(actives.map(a => a.id))
              return (
                <>
                  <div className="ct-slot-bar">
                    <span className="ct-slot-label">{t('contracts.activeTitle')}</span>
                    <span className="ct-slot-count">{actives.length} / {cap}</span>
                    {!canAcceptMore && cap > 0 && <span className="ct-slot-full">{t('contracts.slotsFull')}</span>}
                  </div>

                  {actives.length > 0 && (
                    <div className="ct-active-stack">
                      {actives.map(ac => {
                        const tpl = CONTRACT_TEMPLATES.find(c => c.id === ac.id)
                        if (!tpl) return null
                        const reward  = ac.reward  ?? tpl.reward
                        const deposit = ac.deposit ?? tpl.deposit
                        const prog    = contractProgress(state, ac) || {}
                        const ms      = contractTimeLeft(state, ac)
                        const mins    = Math.floor(ms / 60000)
                        const secs    = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0')
                        const ready   = contractAllMet(state, ac)
                        return (
                          <div key={ac.id} className={`ct-active-card${ready ? ' ready' : ''}`}>
                            <div className="ct-active-head">
                              <span className="ct-icon">{tpl.icon}</span>
                              <span className="ct-name">{t('contract.' + tpl.id + '.label')}</span>
                              <span className="ct-timer">{mins}:{secs} {t('contracts.left')}</span>
                            </div>
                            <div className="ct-req-list">
                              {Object.entries(prog).map(([type, v]) => {
                                const ti = typeInfo(type)
                                const pct = Math.min(100, (v.have / v.need) * 100)
                                const inPipe = Object.values(p).reduce((n, arr) => n + arr.filter(u => u.type === type).length, 0)
                                const remaining = v.need - v.have
                                return (
                                  <div key={type} className={`ct-req${v.done ? ' done' : ''}`}>
                                    <span className="ct-req-ico">{ti.icon}</span>
                                    <span className="ct-req-lbl">{t('device.' + type + '.label')}</span>
                                    <div className="ct-req-bar"><div className="ct-req-fill" style={{ width: `${pct}%` }} /></div>
                                    <span className="ct-req-count">{v.have}/{v.need}</span>
                                    {!v.done && (
                                      <span className="ct-req-pipe" title={t('contracts.inPipeTitle')}>
                                        {inPipe > 0 ? `+${Math.min(inPipe, remaining)} ${t('contracts.inPipe')}` : t('contracts.needMore')}
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                            {ready ? (
                              <button
                                className="ct-deliver"
                                onClick={() => {
                                  const done = (state.counters?.contractsDone || 0) + 1
                                  setUnlockQ(q => [...q, {
                                    kind: 'contract',
                                    icon: tpl.icon,
                                    title: t('contracts.fulfilled'),
                                    name: t('contract.' + tpl.id + '.label'),
                                    detail: tf('contracts.fulfilledDetail', { reward: reward.toLocaleString(), deposit: deposit.toLocaleString() }),
                                    sub: `${t('contracts.completedCount')} ${done}`,
                                  }])
                                  dispatch({ type: 'COMPLETE_CONTRACT', payload: ac.id })
                                }}
                              >
                                {t('contracts.deliver')} ${(reward + deposit).toLocaleString()}
                              </button>
                            ) : (
                              <div className="ct-active-foot">
                                <span className="ct-reward">{t('contracts.reward')} <b>${reward.toLocaleString()}</b> (+${deposit.toLocaleString()} {t('contracts.depositBack')})</span>
                                <button className="ct-cancel" onClick={() => {
                                  if (!window.confirm(tf('contracts.abandonConfirm', { name: t('contract.' + tpl.id + '.label') }))) return
                                  const canFulfill = Object.keys(tpl.required).every(typeId => {
                                    const dt = DEVICE_TYPES.find(d => d.id === typeId)
                                    const curIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
                                    const needIdx = EXPANSION_STAGES.findIndex(s => s.id === dt?.unlockStage)
                                    return curIdx >= needIdx
                                  })
                                  if (canFulfill) {
                                    setUnlockQ(q => [...q, {
                                      kind: 'fail',
                                      icon: '😠',
                                      title: t('contracts.abandoned'),
                                      name: t('contract.' + tpl.id + '.label'),
                                      detail: tf('contracts.abandonedDetail', { deposit: deposit.toLocaleString() }),
                                    }])
                                  }
                                  dispatch({ type: 'FAIL_CONTRACT', payload: ac.id })
                                }}>{t('contracts.abandon')}</button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {salesMgrHired && (
                    <>
                      <div className="ct-offers-hdr">
                        {canAcceptMore ? t('contracts.offersAvail') : t('contracts.offersFull')}
                      </div>
                      <div className="ct-grid">
                        {CONTRACT_TEMPLATES.filter(c => contractUnlocked(c, state) && !activeIds.has(c.id)).map(tpl => {
                          const scaled = scaledContract(tpl, state)
                          const canAfford = state.money >= scaled.deposit
                          const mins = Math.round(tpl.durationMs / 60000)
                          const scaledUp = scaled.mult > 1.01
                          const disabled = !canAfford || !canAcceptMore
                          return (
                            <div key={tpl.id} className="ct-card">
                              <div className="ct-head">
                                <span className="ct-icon">{tpl.icon}</span>
                                <span className="ct-name">{t('contract.' + tpl.id + '.label')}</span>
                                {scaledUp && <span className="ct-scale">{scaled.mult.toFixed(1)}×</span>}
                              </div>
                              <div className="ct-mix">
                                {Object.entries(scaled.required).map(([type, n]) => {
                                  const ti = typeInfo(type)
                                  return <span key={type} className="ct-mix-chip">{ti.icon} ×{n}</span>
                                })}
                              </div>
                              <div className="ct-meta">
                                <span>⏱ {mins} {t('contracts.min')}</span>
                                <span>💰 <b>${scaled.reward.toLocaleString()}</b></span>
                                <span>🔒 ${scaled.deposit.toLocaleString()} {t('contracts.deposit')}</span>
                              </div>
                              <button
                                className={`ct-accept${disabled ? ' dim' : ''}`}
                                disabled={disabled}
                                onClick={() => dispatch({ type: 'ACCEPT_CONTRACT', payload: tpl.id })}
                              >
                                {!canAcceptMore
                                  ? t('contracts.slotsFullBtn')
                                  : canAfford ? t('contracts.accept') : `${t('contracts.need')} $${scaled.deposit.toLocaleString()}`}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {/* Milestones panel */}
        {tab === 'milestones' && (
          <div className="milestones">
            <div className="ms-summary">
              {state.earned.length}/{MILESTONES.length} {t('ms.summary.claimed')}
              {(state.unclaimedMilestones?.length || 0) > 0 && (
                <span className="ms-pending">🎁 {state.unclaimedMilestones.length} {t('ms.summary.ready')}</span>
              )}
              {state.earned.length > 0 && state.bonuses?.sell > 0 && (
                <span className="ms-active-bonus">+{Math.round(state.bonuses.sell * 100)}% {t('ms.summary.bonus')}</span>
              )}
            </div>
            {MILESTONES.map(m => {
              const done       = state.earned.includes(m.id)
              const unclaimed  = (state.unclaimedMilestones || []).includes(m.id)
              const prog       = m.progress ? m.progress(state) : null
              const hideSecret = m.secret && !done && !unclaimed
              const cls = done ? ' earned' : unclaimed ? ' unclaimed' : hideSecret ? ' secret' : ''
              const msLabel  = t('ms.' + m.id + '.label')
              const msDesc   = t('ms.' + m.id + '.desc')
              const msReward = t('ms.' + m.id + '.rewardDesc')
              return (
                <div key={m.id} className={`ms-card${cls}`}>
                  <div className="ms-icon">{hideSecret ? '❓' : m.icon}</div>
                  <div className="ms-body">
                    <div className="ms-name">{hideSecret ? '???' : msLabel}</div>
                    <div className="ms-desc">{hideSecret ? t('ms.hiddenDesc') : msDesc}</div>
                    <div className={`ms-reward${done ? ' done' : ''}`}>
                      {done ? `✓ ${msReward}` : hideSecret ? t('ms.hiddenReward') : msReward}
                    </div>
                    {!done && !unclaimed && !hideSecret && prog && (
                      <div className="ms-prog-wrap">
                        <div className="ms-prog-bar">
                          <div className="ms-prog-fill" style={{ width: `${Math.min(100, (prog.cur / prog.max) * 100)}%` }} />
                        </div>
                        <span className="ms-prog-text">{prog.cur}/{prog.max}</span>
                      </div>
                    )}
                  </div>
                  {unclaimed && (
                    <button
                      className="ms-claim-btn"
                      onClick={() => dispatch({ type: 'CLAIM_MILESTONE', payload: m.id })}
                      title={msReward}
                    >
                      {t('ms.claim')}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {tab === 'stats' && (() => {
          const snaps = throughputRef.current.snapshots
          const newest = snaps[snaps.length - 1]
          const oldest = snaps[0]
          const windowSecs = newest && oldest ? Math.max(1, (newest.ts - oldest.ts) / 1000) : 0
          const ratePerMin = key => {
            if (!newest || !oldest || windowSecs < 5) return null
            return Math.round(((newest[key] - oldest[key]) / windowSecs) * 60 * 10) / 10
          }
          const p = state.pipeline || {}
          const flow = [
            { id: 'audit',  icon: '🔍', label: t('action.audit').replace(/^[^\s]+\s/, ''),  queue: (p.unchecked || []).length, rate: ratePerMin('audited') },
            { id: 'repair', icon: '🔧', label: t('action.repair').replace(/^[^\s]+\s/, ''), queue: (p.audited   || []).length, rate: ratePerMin('repaired') },
            { id: 'image',  icon: '💿', label: t('action.image').replace(/^[^\s]+\s/, ''),  queue: (p.repaired  || []).length, rate: ratePerMin('imaged') },
            { id: 'clean',  icon: '🧹', label: t('action.clean').replace(/^[^\s]+\s/, ''),  queue: (p.imaged    || []).length, rate: ratePerMin('cleaned') },
            { id: 'pack',   icon: '📦', label: t('action.pack').replace(/^[^\s]+\s/, ''),   queue: (p.cleaned   || []).length, rate: ratePerMin('packed') },
            { id: 'ship',   icon: '✅', label: t('action.ship').replace(/^[^\s]+\s/, ''),   queue: (p.packed    || []).length, rate: ratePerMin('sold') },
          ]
          const maxQ = Math.max(1, ...flow.map(f => f.queue))
          const bottleneckId = flow.reduce((best, f) => f.queue > (best?.queue || 0) ? f : best, null)?.id
          const totalQueued = flow.reduce((n, f) => n + f.queue, 0)
          return (
          <div className="stats-panel">
            <div className="stats-title">{t('stats.flow')}</div>
            <div className="flow-table">
              {flow.map(f => (
                <div key={f.id} className={`flow-row${f.id === bottleneckId && f.queue > 0 && totalQueued >= 3 ? ' bottleneck' : ''}`}>
                  <span className="flow-icon">{f.icon}</span>
                  <span className="flow-label">{f.label}</span>
                  <div className="flow-bar-wrap">
                    <div className="flow-bar" style={{ width: `${(f.queue / maxQ) * 100}%` }} />
                  </div>
                  <span className="flow-queue">{f.queue}</span>
                  <span className="flow-rate">{f.rate == null ? '—' : `${f.rate}${t('stats.perMin')}`}</span>
                  {f.id === bottleneckId && f.queue > 0 && totalQueued >= 3 && <span className="flow-bneck">{t('stats.bottleneck')}</span>}
                </div>
              ))}
            </div>
            <div className="stats-title">{t('stats.lifetime')}</div>
            <div className="stats-grid">
              <StatCard icon="💵" label={t('stats.cashHand')}   val={`$${state.money.toLocaleString()}`} />
              <StatCard icon="📈" label={t('stats.netProfit')}  val={`$${netProfit.toLocaleString()}`} accent={netProfit >= 0 ? 'good' : 'bad'} />
              <StatCard icon="💰" label={t('stats.totalEarned')} val={`$${state.totalEarned.toLocaleString()}`} />
              <StatCard icon="🛒" label={t('stats.totalSpent')} val={`$${state.totalSpent.toLocaleString()}`} />
              <StatCard icon="🏷️" label={t('stats.feesPaid')}   val={`$${(state.totalFees || 0).toLocaleString()}`} />
              <StatCard icon="🏆" label={t('stats.bestFlip')}   val={`$${state.bestProfit.toLocaleString()}`} />
            </div>
            <div className="stats-title">{t('stats.pipelineWork')}</div>
            <div className="stats-grid">
              <StatCard icon="📦" label={t('stats.bought')}   val={(state.counters?.bought   || 0).toLocaleString()} />
              <StatCard icon="🔍" label={t('stats.audited')}  val={(state.counters?.audited  || 0).toLocaleString()} />
              <StatCard icon="🔧" label={t('stats.repaired')} val={(state.counters?.repaired || 0).toLocaleString()} />
              <StatCard icon="🗑️" label={t('stats.scrapped')} val={(state.counters?.scrapped || 0).toLocaleString()} accent="bad" />
              <StatCard icon="💿" label={t('stats.imaged')}   val={(state.counters?.imaged   || 0).toLocaleString()} />
              <StatCard icon="🧹" label={t('stats.cleaned')}  val={(state.counters?.cleaned  || 0).toLocaleString()} />
              <StatCard icon="📦" label={t('stats.packed')}   val={(state.counters?.packed   || 0).toLocaleString()} />
              <StatCard icon="✅" label={t('stats.sold')}     val={state.sold.toLocaleString()} accent="good" />
            </div>
            <div className="stats-title">{t('stats.byType')}</div>
            <div className="stats-grid">
              {DEVICE_TYPES.map(dt => (
                <StatCard key={dt.id} icon={dt.icon} label={t('device.' + dt.id + '.label')} val={((state.counters?.typeSoldCount || {})[dt.id] || 0).toLocaleString()} />
              ))}
            </div>
            <div className="stats-title">{t('stats.operation')}</div>
            <div className="stats-grid">
              <StatCard icon={expansion.icon} label={t('stats.currentStage')} val={t('stage.' + expansion.id + '.label')} />
              <StatCard icon="📥" label={t('stats.lotsBought')}   val={(state.counters?.lotsTotal || 0).toLocaleString()} />
              <StatCard icon="🚀" label={t('stats.biggestBatch')} val={(state.counters?.biggestBatch || 0).toLocaleString()} />
              <StatCard icon="🏅" label={t('stats.milestones')}   val={`${state.earned.length}/${MILESTONES.length}`} />
              <StatCard icon="📝" label={t('stats.contractsDone')} val={(state.counters?.contractsDone || 0).toLocaleString()} />
            </div>
          </div>
          )
        })()}

        {broke && (
          <div className="broke-banner">
            {t('broke.msg')}
            <button className="broke-reset" onClick={() => dispatch({ type: 'RESET' })}>{t('broke.restart')}</button>
          </div>
        )}

      </div>

      {logOpen && (
        <div className="log-modal-overlay" onClick={() => setLogOpen(false)}>
          <div className="log-modal" onClick={e => e.stopPropagation()}>
            <div className="log-modal-head">
              <span>{t('log.title')}</span>
              <button className="log-modal-close" onClick={() => setLogOpen(false)}>✕</button>
            </div>
            <div className="log log-full">
              {state.log.length === 0 && <div className="log-empty">{t('log.emptyShort')}</div>}
              {state.log.map(e => {
                const txt = logText(e)
                if (!txt) return null
                return (
                  <div key={e.id} className={`log-row kind-${logKind(txt)}`}>
                    <span className="log-t">{e.t}</span>
                    <span className="log-msg">{txt}{e.count > 1 && <span className="log-x"> ×{e.count}</span>}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {state.activeEvent && eventOpen && (() => {
        const ev = DECISION_EVENTS.find(e => e.id === state.activeEvent)
        if (!ev) return null
        const wide = (ev.options?.length || 0) >= 3
        const startedAt = state.activeEventAt || tickNow
        const elapsed = Math.max(0, tickNow - startedAt)
        const secsLeft = Math.max(0, Math.ceil((60_000 - elapsed) / 1000))
        const pctLeft = Math.max(0, Math.min(100, 100 - (elapsed / 60_000) * 100))
        const resolve = (i, optText) => {
          const before = stateRef.current
          dispatch({ type: 'RESOLVE_EVENT', payload: { optionIndex: i } })
          setEventOpen(false)
          setTimeout(() => {
            const after = stateRef.current
            setEventToast({
              icon: ev.icon,
              title: t('event.' + ev.id + '.title'),
              choice: optText,
              msg: after.log?.[0]?.msg || '',
              moneyDelta: (after.money || 0) - (before.money || 0),
              partsDelta: (after.parts || 0) - (before.parts || 0),
              expiresAt: Date.now() + 5000,
            })
          }, 20)
        }
        return (
          <div className="event-overlay" onClick={() => setEventOpen(false)}>
            <div className={`event-card${wide ? ' wide' : ''}`} onClick={e => e.stopPropagation()}>
              <button className="event-close" onClick={() => setEventOpen(false)} aria-label={t('event.close')}>×</button>
              <div className="event-icon">{ev.icon}</div>
              <div className="event-title">{t('event.' + ev.id + '.title')}</div>
              <div className="event-body">{t('event.' + ev.id + '.body')}</div>
              <div className="event-timer-row">
                <span className="ec-timer"><span className="ec-timer-fill" style={{ width: `${pctLeft}%` }} /></span>
                <span className="event-secs">{secsLeft}s</span>
              </div>
              <div className={`event-options${wide ? ' multi' : ''}`}>
                {ev.options.map((opt, i) => {
                  const text = typeof opt.label === 'function' ? opt.label(state) : opt.label
                  return (
                    <button
                      key={i}
                      className={`event-btn${i === 0 ? ' primary' : ''}`}
                      onClick={() => resolve(i, text)}
                    >
                      {text}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {alertToast && alertToast.expiresAt > tickNow && (
        <div className={`alert-toast at-${alertToast.variant || 'error'}`} onClick={() => setAlertToast(null)}>
          <span className="at-icon">{alertToast.icon || '❌'}</span>
          <span className="at-msg">{alertToast.msg}</span>
          <span className="at-close">×</span>
        </div>
      )}

      {eventToast && eventToast.expiresAt > tickNow && (
        <div className="event-toast" onClick={() => setEventToast(null)}>
          <div className="et-header">
            <span className="et-icon">{eventToast.icon}</span>
            <span className="et-title">{eventToast.title}</span>
            <span className="et-close">×</span>
          </div>
          <div className="et-choice">{t('event.youChose')} <strong>{eventToast.choice}</strong></div>
          {eventToast.msg && <div className="et-msg">{eventToast.msg}</div>}
          {(eventToast.moneyDelta !== 0 || eventToast.partsDelta !== 0) && (
            <div className="et-deltas">
              {eventToast.moneyDelta !== 0 && (
                <span className={eventToast.moneyDelta > 0 ? 'et-gain' : 'et-loss'}>
                  {eventToast.moneyDelta > 0 ? '+' : ''}${eventToast.moneyDelta.toLocaleString()}
                </span>
              )}
              {eventToast.partsDelta !== 0 && (
                <span className={eventToast.partsDelta > 0 ? 'et-gain' : 'et-loss'}>
                  {eventToast.partsDelta > 0 ? '+' : ''}{eventToast.partsDelta} {t('event.parts')}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {offlineSummary && !state.gameOver && (() => {
        const o = offlineSummary
        const mins = Math.floor(o.ms / 60_000)
        const secs = Math.floor((o.ms % 60_000) / 1000)
        const away = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
        return (
          <div className="gameover-overlay">
            <div className="gameover-card offline-card">
              <div className="go-icon">⏱️</div>
              <div className="go-title">{t('away.title')}</div>
              <div className="go-sub">
                {away} {o.capped ? t('away.capped') : ''} — {t('away.sub')}
              </div>
              <div className="go-stats">
                <div className="go-stat">
                  <div className="go-stat-label">{t('away.sold')}</div>
                  <div className="go-stat-value">+{o.sold}</div>
                </div>
                <div className="go-stat">
                  <div className="go-stat-label">{t('away.earned')}</div>
                  <div className="go-stat-value">${o.earned.toLocaleString()}</div>
                </div>
                {o.partsArrived > 0 && (
                  <div className="go-stat">
                    <div className="go-stat-label">{t('away.parts')}</div>
                    <div className="go-stat-value">+{o.partsArrived}</div>
                  </div>
                )}
                {o.lotsArrived > 0 && (
                  <div className="go-stat">
                    <div className="go-stat-label">{t('away.lots')}</div>
                    <div className="go-stat-value">+{o.lotsArrived}</div>
                  </div>
                )}
                {o.payrolls > 0 && (
                  <div className="go-stat">
                    <div className="go-stat-label">{t('away.payrolls')}</div>
                    <div className="go-stat-value">{o.payrolls} · -${o.spent.toLocaleString()}</div>
                  </div>
                )}
                {o.payrollsMissed > 0 && (
                  <div className="go-stat">
                    <div className="go-stat-label">{t('away.missed')}</div>
                    <div className="go-stat-value">{o.payrollsMissed}</div>
                  </div>
                )}
              </div>
              <button className="go-restart-btn" onClick={() => setOfflineSummary(null)}>
                {t('away.continue')}
              </button>
            </div>
          </div>
        )
      })()}

      {!state.onboardedAt && !state.gameOver && (
        <div className="levelup-overlay kind-ok">
          <div className="levelup-card">
            <div className="lu-icon">🔧</div>
            <div className="lu-title">Welcome to Laptop Refurb Tycoon</div>
            <div className="lu-name">Run the pipeline. Flip beat-up laptops into cash.</div>
            <div className="lu-perks">
              Every unit walks through six stages: <b>Buy → Audit → Repair → Image → Clean → Pack → Ship</b>.
              Click the action buttons to move one unit at a time, or hire workers to automate each stage.
            </div>
            <div className="lu-sub" style={{ lineHeight: '1.4', opacity: 0.9 }}>
              🛒 Buy devices from suppliers in the <b>Shop</b>.<br />
              👤 Hire a <b>Repair Tech</b>, <b>Imager</b>, <b>Cleaner</b>, and <b>Packer</b> to automate the floor.<br />
              🔩 Repairs need <b>parts</b> — keep some in stock.<br />
              📝 Once you unlock the <b>Sales Manager</b>, take <b>contracts</b> for bigger payouts.<br />
              🏪 Sell enough to upgrade your shop — 5 stages from Garage → Company.
            </div>
            <div className="lu-sub" style={{ marginTop: '10px', opacity: 0.7, fontSize: '0.8rem' }}>
              This is a playtest build — the game caps at <b>Company</b> stage. Send feedback when you're done!
            </div>
            <button className="lu-dismiss" onClick={() => dispatch({ type: 'ACK_ONBOARDING' })}>
              Start playing
            </button>
          </div>
        </div>
      )}

      {state.trialCompletedAt && !state.trialAckedAt && !state.gameOver && (
        <div className="levelup-overlay kind-contract">
          <div className="levelup-card">
            <div className="lu-fireworks">🎉🎊🎉</div>
            <div className="lu-icon">🏆</div>
            <div className="lu-title">Thanks for playing the trial!</div>
            <div className="lu-name">You hit the Company stage — end of the test run.</div>
            <div className="lu-perks">
              You made it through the full pipeline, built a crew, and scaled from a garage to a Company.
              The playtest build caps here — Regional / National / Corporate and multi-shop are coming later.
            </div>
            <div className="lu-sub" style={{ lineHeight: '1.5' }}>
              <b>{state.sold?.toLocaleString() || 0}</b> units sold · <b>${state.totalEarned?.toLocaleString() || 0}</b> lifetime earnings · <b>{state.counters?.contractsDone || 0}</b> contracts delivered
            </div>
            <div className="lu-sub" style={{ marginTop: '10px', opacity: 0.8 }}>
              Feel free to keep grinding — everything still works, there's just no new shop to unlock.
              Send Andrew your feedback: what felt good, what sucked, what you'd cut.
            </div>
            <button className="lu-dismiss" onClick={() => dispatch({ type: 'ACK_TRIAL_END' })}>
              Keep playing
            </button>
          </div>
        </div>
      )}

      {state.gameOver && (
        <div className="gameover-overlay">
          <div className="gameover-card">
            <div className="go-icon">💀</div>
            <div className="go-title">{t('go.title')}</div>
            <div className="go-sub">{t('go.subLong')}</div>
            <div className="go-stats">
              <div className="go-stat">
                <div className="go-stat-label">{t('go.unitsSold')}</div>
                <div className="go-stat-value">{state.sold?.toLocaleString() || 0}</div>
              </div>
              <div className="go-stat">
                <div className="go-stat-label">{t('go.lifetime')}</div>
                <div className="go-stat-value">${state.totalEarned?.toLocaleString() || 0}</div>
              </div>
              <div className="go-stat">
                <div className="go-stat-label">{t('go.bestProfit')}</div>
                <div className="go-stat-value">${state.bestProfit?.toLocaleString() || 0}</div>
              </div>
              <div className="go-stat">
                <div className="go-stat-label">{t('go.stageReached')}</div>
                <div className="go-stat-value">{(() => { const s = EXPANSION_STAGES.find(s => s.id === state.expansionStage); return s ? t('stage.' + s.id + '.label') : '—' })()}</div>
              </div>
              <div className="go-stat">
                <div className="go-stat-label">{t('go.contractsDone')}</div>
                <div className="go-stat-value">{state.counters?.contractsDone || 0}</div>
              </div>
              <div className="go-stat">
                <div className="go-stat-label">{t('go.achievements')}</div>
                <div className="go-stat-value">{state.earned?.length || 0}</div>
              </div>
            </div>
            <button
              className="go-restart-btn"
              onClick={() => {
                localStorage.removeItem(SAVE_KEY)
                dispatch({ type: 'RESET' })
              }}
            >
              {t('go.startOver')}
            </button>
          </div>
        </div>
      )}

      {levelUpCard && (
        <div className={`levelup-overlay kind-${levelUpCard.kind}`} onClick={() => setLevelUp(null)}>
          <div className="levelup-card" onClick={(e) => e.stopPropagation()}>
            <div className="lu-fireworks">🎉🎊🎉</div>
            <div className="lu-icon">{levelUpCard.icon}</div>
            <div className="lu-title">{levelUpCard.title}</div>
            <div className="lu-name">{levelUpCard.name}</div>
            {levelUpCard.detail && <div className="lu-perks">{levelUpCard.detail}</div>}
            {levelUpCard.sub && <div className="lu-sub">{levelUpCard.sub}</div>}
            {Array.isArray(levelUpCard.items) && levelUpCard.items.length > 0 && (
              <div className="lu-items">
                <div className="lu-items-head">{t('unlock.alsoUnlocked')}</div>
                <ul className="lu-items-list">
                  {levelUpCard.items.map((it, i) => (
                    <li key={i} className={`lu-item lu-item-${it.kind}`}>
                      <span className="lu-item-icon">{it.icon}</span>
                      <span className="lu-item-name">{it.name}</span>
                      {it.detail && <span className="lu-item-detail">{it.detail}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button className="lu-dismiss" onClick={() => setLevelUp(null)}>
              {levelUpCard.kind === 'fail' ? t('levelup.failCta') : t('levelup.winCta')}
            </button>
          </div>
        </div>
      )}

      {expandModal && (() => {
        const ready = expansionReady(state)
        if (!ready) { setExpandModal(false); return null }
        const cur = currentExpansion(state)
        const afford = canAffordExpansion(state)
        const gap = Math.max(0, (ready.cost || 0) - (state.money || 0))
        return (
          <div className="levelup-overlay kind-ok" onClick={() => setExpandModal(false)}>
            <div className="levelup-card" onClick={(e) => e.stopPropagation()}>
              <div className="lu-icon">{ready.icon}</div>
              <div className="lu-title">{t('expand.title')}</div>
              <div className="lu-name">{cur.icon} {cur.label} → {ready.icon} {ready.label}</div>
              <div className="lu-perks">{tf('expand.perks', { lots: ready.lots.filter(n => n > 1).join(', ') })}</div>
              <div className="lu-sub">{tf('expand.cost', { cost: ready.cost.toLocaleString() })}</div>
              {!afford && <div className="lu-sub" style={{ color: '#ff7a7a' }}>{tf('expand.short', { gap: gap.toLocaleString() })}</div>}
              <div className="expand-btns">
                <button
                  className={`lu-dismiss${afford ? '' : ' dim'}`}
                  disabled={!afford}
                  onClick={() => { dispatch({ type: 'EXPAND_ACCEPT' }); setExpandModal(false) }}
                >
                  {tf('expand.pay', { cost: ready.cost.toLocaleString() })}
                </button>
                <button className="lu-dismiss lu-dismiss-alt" onClick={() => setExpandModal(false)}>
                  {t('expand.bypass')}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      <div className="footer">
        <button className="footer-btn" onClick={exportSave}>{t('footer.export')}</button>
        <button className="footer-btn" onClick={() => fileInputRef.current?.click()}>{t('footer.import')}</button>
        <input ref={fileInputRef} type="file" accept="application/json" onChange={importSave} style={{ display: 'none' }} />
        <button className="reset-btn" onClick={() => { if (window.confirm(t('footer.resetConfirm'))) dispatch({ type: 'RESET' }) }}>
          {t('footer.reset')}
        </button>
      </div>

    </div>
  )
}

// Classify a log message by its leading glyph so rows can be color-coded.
// Returns one of: money, repair, audit, clean, image, pack, ship, event, parts,
// scrap, milestone, warning, info.
function logKind(msg = '') {
  const head = msg.trim().slice(0, 3)
  if (/^(💵|💰|💸|💲|📈)/.test(head))                 return 'money'
  if (/^(🏅|🎉|🎊|🏆|⭐|💎|🚀)/.test(head))            return 'milestone'
  if (/^(⚠|❌|💀|🚔|⚖|💢|🔥|😡|💥|😬|🤦)/.test(head)) return 'warning'
  if (/^(🔧|🛠)/.test(head))                            return 'repair'
  if (/^(🔍)/.test(head))                               return 'audit'
  if (/^(💿)/.test(head))                               return 'image'
  if (/^(🧹)/.test(head))                               return 'clean'
  if (/^(📦|📮)/.test(head))                            return 'pack'
  if (/^(🚚|✈|🛒|🐉|📦|🏭)/.test(head))                 return 'parts'
  if (/^(🗑|♻)/.test(head))                             return 'scrap'
  if (/^(☕|🍕|🎊)/.test(head))                         return 'event'
  return 'info'
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

function StatCard({ icon, label, val, accent }) {
  return (
    <div className={`stat-card${accent ? ` stat-${accent}` : ''}`}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-body">
        <div className="stat-label">{label}</div>
        <div className="stat-val">{val}</div>
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
