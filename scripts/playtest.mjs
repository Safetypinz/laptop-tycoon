// scripts/playtest.mjs
//
// Headless AI playtest harness for Laptop Refurb Tycoon.
// Advances Date.now() manually, drives the reducer with simple heuristics,
// and prints a summary at the end (state transitions, bugs, balance, softlocks).
//
// Run: cd /Users/user/Desktop/Projects/laptop-tycoon && node scripts/playtest.mjs
// Or: PROFILE=aggressive node scripts/playtest.mjs
//     PROFILE=hoarder node scripts/playtest.mjs
//     PROFILE=idle node scripts/playtest.mjs
//     PROFILE=default node scripts/playtest.mjs   (original behavior)
// CLI equivalent: node scripts/playtest.mjs --profile=aggressive

// ─── 0. Profile selection ────────────────────────────────────────────────────
const argProfile = (process.argv.find(a => a.startsWith('--profile=')) || '').split('=')[1]
const envProfile = process.env.PROFILE
const PROFILE = (argProfile || envProfile || 'default').toLowerCase()
const VALID_PROFILES = new Set(['default', 'aggressive', 'hoarder', 'idle'])
if (!VALID_PROFILES.has(PROFILE)) {
  console.error(`Unknown profile '${PROFILE}'. Valid: ${[...VALID_PROFILES].join(', ')}`)
  process.exit(1)
}

// ─── 1. Patch Date.now BEFORE importing game.js ──────────────────────────────
const START_EPOCH = 1_700_000_000_000 // arbitrary stable base
let fakeNow = START_EPOCH
const realDateNow = Date.now.bind(Date)
Date.now = () => fakeNow
// Preserve `new Date()` for log timestamps — they still read real clock, NBD.

// ─── 2. Import game.js ────────────────────────────────────────────────────────
const game = await import('../src/game.js')
const {
  reducer, makeInitialState,
  WORKER_DEFS, SPECIAL_HIRES, PART_SOURCES, SUPPLIERS, EXPANSION_STAGES,
  DURATIONS, DECISION_EVENTS, CONTRACT_TEMPLATES,
  wageDue, isBankrupt,
  workerStageUnlocked, workerMaxCount, workerHireCost, workerAcceptsUnit, workerDuration,
  upgradeCost,
  specialHireCost,
  partsNeeded, partSourceUnlocked,
  rollAuditEvents, rollRepairEvents, supplierFromId,
  globalSpeedMult, moraleUnlocked,
  activeContractsList, contractTimeLeft, contractAllMet, maxConcurrentContracts,
  pickDecisionEvent,
  currentExpansion,
  scaledContract, contractUnlocked, contractFulfillable,
} = game

// ─── 3. Harness state ─────────────────────────────────────────────────────────
let state = makeInitialState()
const events = []                  // high-signal transitions
const dispatchCounts = {}
const snapshots = []               // every 10 sim-seconds
const actionLog = []               // every dispatch (bounded)

const SIM_MINUTES = 30
const SIM_END = START_EPOCH + SIM_MINUTES * 60_000
const TICK_MS = 100                // 100ms per loop iteration
const SNAPSHOT_MS = 10_000
let lastSnapshotAt = START_EPOCH

// per-worker-role "next fire time" — simulates one action slot per role.
// (We collapse N workers into N parallel slots by bumping `slots` count.)
const roleSlotFreeAt = {} // { roleId: [t1, t2, ...] one per worker count }

// Guard: cap on total dispatches to avoid runaway
let totalDispatches = 0
const MAX_DISPATCHES = 500_000

// ─── Extra metric tracking ───────────────────────────────────────────────────
const metrics = {
  timeToShop: null,
  timeToWarehouse: null,
  timeToCompany: null,
  missedPayrolls: 0,
  partsZeroTicks: 0,
  totalTicks: 0,
  workersHired: 0,    // cumulative (counts upgrades-as-hires? no — just fresh hires)
  specialsHired: 0,
  gameOver: false,
  longestBoringMs: 0,
}

function note(msg) {
  events.push({ t: fakeNow - START_EPOCH, msg })
}

function dispatch(action) {
  totalDispatches++
  if (totalDispatches > MAX_DISPATCHES) {
    throw new Error(`dispatch cap hit at ${totalDispatches}`)
  }
  dispatchCounts[action.type] = (dispatchCounts[action.type] || 0) + 1
  const before = state
  try {
    state = reducer(state, action)
  } catch (e) {
    note(`CRASH in reducer on ${action.type}: ${e.message}`)
    throw e
  }
  // Bug sniff: NaN/negatives after every reduce
  if (!Number.isFinite(state.money)) {
    note(`BUG: money became non-finite after ${action.type} (was ${before.money})`)
  }
  if (state.parts < 0) {
    note(`BUG: parts went negative after ${action.type} (${before.parts} -> ${state.parts})`)
  }
  // Tiny trail for post-mortem
  if (actionLog.length < 4000) actionLog.push({ t: fakeNow - START_EPOCH, type: action.type })
}

// ─── 4. Profile-specific heuristics ──────────────────────────────────────────
// Each profile implements a block of heuristic predicates. The harness mechanics
// (worker slot simulation, manual task driver, completion draining, timers) are
// identical across profiles — only the "player decision" layer changes.

function cheapestLotCost() {
  // Very rough: typical fair unit ~ 13 at 1.0 mult → ~$13/unit
  return 13
}

function uncheckedPipelineLen() {
  const p = state.pipeline
  return (p.unchecked?.length || 0) + (p.incoming?.length || 0)
}

function currentLotCostEstimate() {
  const supId = state.activeSupplier
  const sup = SUPPLIERS.find(s => s.id === supId) || SUPPLIERS[1]
  return Math.round(13 * sup.priceMult)
}

function pickLotSize(bufferMult = 1.3) {
  const stage = currentExpansion(state)
  const sizes = stage.lots || [1]
  const supId = state.activeSupplier
  const sup = SUPPLIERS.find(s => s.id === supId) || SUPPLIERS[1]
  const perUnit = Math.round(13 * sup.priceMult)
  for (let i = sizes.length - 1; i >= 0; i--) {
    const q = sizes[i]
    const est = perUnit * q * 0.7 // assume some lot discount
    if (state.money > est * bufferMult) return q
  }
  return sizes[0]
}

// ─── Default profile (original behavior) ──────────────────────────────────────

const defaultProfile = {
  name: 'default',
  tryBuyLot() {
    if (state.gameOver) return
    const cheap = cheapestLotCost()
    if (state.money < cheap * 1.5) return
    if (uncheckedPipelineLen() >= 10) return
    const needHireReserve = (state.workers?.auditor?.count || 0) === 0
    if (needHireReserve && state.money < 75 + cheap) return
    const qty = pickLotSize(1.3)
    dispatch({ type: qty > 1 ? 'BUY_LOT' : 'BUY', payload: qty > 1 ? qty : {} })
  },
  tryHireWorkers() {
    if (state.gameOver) return
    const order = ['auditor', 'tech', 'packer', 'cleaner', 'imager', 'desktopTech']
    for (const id of order) {
      const def = WORKER_DEFS.find(d => d.id === id)
      if (!def) continue
      if (!workerStageUnlocked(def, state)) continue
      if (state.sold < (def.unlockSold || 0)) continue
      const w = state.workers[def.id] || { count: 0, level: 1 }
      const cap = workerMaxCount(def, state)
      if (w.count >= cap) continue
      const cost = workerHireCost(def, w.count, state)
      const firstOfRole = w.count === 0
      const requiredBuffer = firstOfRole && def.id === 'auditor' ? 1.0 : firstOfRole ? 1.2 : 2.0
      if (state.money < cost * requiredBuffer) continue
      if (!firstOfRole) {
        const inputLen = (state.pipeline[def.input] || []).length
        if (inputLen < 3) continue
      }
      dispatch({ type: 'HIRE_WORKER', payload: def.id })
      metrics.workersHired++
      note(`HIRE ${def.id} #${(state.workers[def.id]?.count) || '?'} @ money=$${state.money}`)
      return
    }
  },
  tryOrderParts() {
    if (state.gameOver) return
    const hasTech = (state.workers?.tech?.count || 0) + (state.workers?.desktopTech?.count || 0) > 0
    const auditedQueue = state.pipeline.audited || []
    const needRepair = auditedQueue.length > 0
    if (!hasTech && !needRepair) return
    const incomingParts = (state.partsIncoming || []).reduce((n, o) => n + o.qty, 0)
    const total = (state.parts || 0) + incomingParts
    if (total >= 3) return
    const src = PART_SOURCES.find(s => s.id === 'ebay')
    if (!src) return
    if (state.money < src.cost * 1.5) return
    dispatch({ type: 'ORDER_PARTS', payload: 'ebay' })
  },
  tryHireSpecials() {
    if (state.gameOver) return
    const order = ['manager', 'inventory', 'buyer', 'sales', 'headAuditor']
    for (const id of order) {
      const def = SPECIAL_HIRES.find(d => d.id === id)
      if (!def) continue
      const sp = state.specials[def.id]
      if (sp?.hired) continue
      const curIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
      const reqIdx = EXPANSION_STAGES.findIndex(s => s.id === def.unlockStage)
      if (curIdx < reqIdx) continue
      const cost = specialHireCost(def, state)
      if (state.money < cost * 1.5) continue
      dispatch({ type: 'HIRE_SPECIAL', payload: def.id })
      metrics.specialsHired++
      note(`HIRE_SPECIAL ${def.id} @ money=$${state.money} cost=$${cost}`)
      return
    }
  },
  tryUpgrade() { /* default doesn't upgrade */ },
  tryAcceptContracts() {
    if (state.gameOver) return
    if (!state.specials?.sales?.hired) return
    const cap = maxConcurrentContracts(state)
    const list = activeContractsList(state)
    if (list.length >= cap) return
    for (const tpl of CONTRACT_TEMPLATES) {
      if (!contractUnlocked(tpl, state)) continue
      if (list.some(c => c.id === tpl.id)) continue
      const scaled = scaledContract(tpl, state)
      if (state.money < scaled.deposit * 1.5) continue
      dispatch({ type: 'ACCEPT_CONTRACT', payload: tpl.id })
      note(`CONTRACT accept ${tpl.id}`)
      break
    }
  },
  tryResolveEvent() {
    if (!state.activeEvent) return
    const ev = DECISION_EVENTS.find(e => e.id === state.activeEvent)
    if (!ev) { dispatch({ type: 'DISMISS_EVENT' }); return }
    const safeIdx = ev.options.length >= 2 ? 1 : 0
    dispatch({ type: 'RESOLVE_EVENT', payload: { optionIndex: safeIdx } })
    note(`EVENT resolved: ${ev.id} opt=${safeIdx}`)
  },
  tryShip() {
    if (state.gameOver) return
    if ((state.pipeline.packed?.length || 0) === 0) return
    dispatch({ type: 'BULK_SHIP' })
  },
}

// ─── Aggressive: sprinter. Spend on everything the moment it unlocks ─────────

const aggressiveProfile = {
  name: 'aggressive',
  tryBuyLot() {
    if (state.gameOver) return
    const cheap = cheapestLotCost()
    if (state.money < cheap) return // can I afford even 1 unit?
    // Don't hoard — if there's stage capacity, grab the biggest lot we can pay for.
    const qty = pickLotSize(1.0)
    dispatch({ type: qty > 1 ? 'BUY_LOT' : 'BUY', payload: qty > 1 ? qty : {} })
  },
  tryHireWorkers() {
    if (state.gameOver) return
    // Fire every unlocked role + every allowed extra the moment cash permits.
    const order = ['auditor', 'tech', 'packer', 'cleaner', 'imager', 'desktopTech']
    for (const id of order) {
      const def = WORKER_DEFS.find(d => d.id === id)
      if (!def) continue
      if (!workerStageUnlocked(def, state)) continue
      if (state.sold < (def.unlockSold || 0)) continue
      const w = state.workers[def.id] || { count: 0, level: 1 }
      const cap = workerMaxCount(def, state)
      if (w.count >= cap) continue
      const cost = workerHireCost(def, w.count, state)
      if (state.money < cost) continue
      dispatch({ type: 'HIRE_WORKER', payload: def.id })
      metrics.workersHired++
      note(`HIRE ${def.id} #${(state.workers[def.id]?.count) || '?'} @ money=$${state.money}`)
      return
    }
  },
  tryOrderParts() {
    if (state.gameOver) return
    const incomingParts = (state.partsIncoming || []).reduce((n, o) => n + o.qty, 0)
    const total = (state.parts || 0) + incomingParts
    // Prefer China Bulk when unlocked; fall back to eBay
    const china = PART_SOURCES.find(s => s.id === 'china')
    const ebay = PART_SOURCES.find(s => s.id === 'ebay')
    const chinaOk = china && partSourceUnlocked(china, state)
    if (chinaOk && total < 15 && state.money >= china.cost) {
      dispatch({ type: 'ORDER_PARTS', payload: 'china' })
      return
    }
    if (!chinaOk && total < 3 && ebay && state.money >= ebay.cost) {
      dispatch({ type: 'ORDER_PARTS', payload: 'ebay' })
    }
  },
  tryHireSpecials() {
    if (state.gameOver) return
    const order = ['manager', 'inventory', 'buyer', 'sales', 'headAuditor']
    for (const id of order) {
      const def = SPECIAL_HIRES.find(d => d.id === id)
      if (!def) continue
      const sp = state.specials[def.id]
      if (sp?.hired) continue
      const curIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
      const reqIdx = EXPANSION_STAGES.findIndex(s => s.id === def.unlockStage)
      if (curIdx < reqIdx) continue
      const cost = specialHireCost(def, state)
      if (state.money < cost) continue
      dispatch({ type: 'HIRE_SPECIAL', payload: def.id })
      metrics.specialsHired++
      note(`HIRE_SPECIAL ${def.id} @ money=$${state.money} cost=$${cost}`)
      return
    }
  },
  tryUpgrade() {
    if (state.gameOver) return
    // Upgrade any worker where possible, cheapest first.
    const candidates = []
    for (const def of WORKER_DEFS) {
      const w = state.workers[def.id]
      if (!w || w.count < 1 || w.level >= 5) continue
      const cost = upgradeCost(def, w.level)
      if (state.money < cost) continue
      candidates.push({ def, cost })
    }
    if (candidates.length === 0) return
    candidates.sort((a, b) => a.cost - b.cost)
    const pick = candidates[0]
    dispatch({ type: 'UPGRADE_WORKER', payload: pick.def.id })
    note(`UPGRADE_WORKER ${pick.def.id} @ cost=$${pick.cost}`)
  },
  tryAcceptContracts() {
    if (state.gameOver) return
    if (!state.specials?.sales?.hired) return
    const cap = maxConcurrentContracts(state)
    const list = activeContractsList(state)
    if (list.length >= cap) return
    for (const tpl of CONTRACT_TEMPLATES) {
      if (!contractUnlocked(tpl, state)) continue
      if (list.some(c => c.id === tpl.id)) continue
      const scaled = scaledContract(tpl, state)
      if (state.money < scaled.deposit) continue // accept every one we can afford
      dispatch({ type: 'ACCEPT_CONTRACT', payload: tpl.id })
      note(`CONTRACT accept ${tpl.id}`)
      break
    }
  },
  tryResolveEvent() { return defaultProfile.tryResolveEvent() },
  tryShip() { return defaultProfile.tryShip() },
}

// ─── Hoarder: turtle. Save a buffer, hire only when queues back up ────────────

const hoarderProfile = {
  name: 'hoarder',
  tryBuyLot() {
    if (state.gameOver) return
    const perUnit = currentLotCostEstimate()
    // Only buy when cash >= lot cost × 3. Use the smallest lot available to minimize risk.
    const stage = currentExpansion(state)
    const sizes = stage.lots || [1]
    const smallest = sizes[0]
    const estCost = perUnit * smallest * 0.7
    if (state.money < estCost * 3) return
    if (uncheckedPipelineLen() >= 15) return
    dispatch({ type: smallest > 1 ? 'BUY_LOT' : 'BUY', payload: smallest > 1 ? smallest : {} })
  },
  tryHireWorkers() {
    if (state.gameOver) return
    const order = ['auditor', 'tech', 'packer', 'cleaner', 'imager', 'desktopTech']
    for (const id of order) {
      const def = WORKER_DEFS.find(d => d.id === id)
      if (!def) continue
      if (!workerStageUnlocked(def, state)) continue
      if (state.sold < (def.unlockSold || 0)) continue
      const w = state.workers[def.id] || { count: 0, level: 1 }
      const cap = workerMaxCount(def, state)
      if (w.count >= cap) continue
      const cost = workerHireCost(def, w.count, state)
      // Turtle rule: input queue > 5 AND cash ≥ 3× hire cost
      const inputLen = (state.pipeline[def.input] || []).length
      if (inputLen <= 5) continue
      if (state.money < cost * 3) continue
      dispatch({ type: 'HIRE_WORKER', payload: def.id })
      metrics.workersHired++
      note(`HIRE ${def.id} #${(state.workers[def.id]?.count) || '?'} (queue=${inputLen}) @ money=$${state.money}`)
      return
    }
  },
  tryOrderParts() {
    if (state.gameOver) return
    // eBay only, only when parts = 0
    if ((state.parts || 0) > 0) return
    const incomingParts = (state.partsIncoming || []).reduce((n, o) => n + o.qty, 0)
    if (incomingParts > 0) return
    const ebay = PART_SOURCES.find(s => s.id === 'ebay')
    if (!ebay) return
    if (state.money < ebay.cost * 2) return // keep buffer
    dispatch({ type: 'ORDER_PARTS', payload: 'ebay' })
  },
  tryHireSpecials() {
    if (state.gameOver) return
    // Only ever hire a single special — Floor Manager — and only once.
    const def = SPECIAL_HIRES.find(d => d.id === 'manager')
    if (!def) return
    const sp = state.specials[def.id]
    if (sp?.hired) return
    const curIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
    const reqIdx = EXPANSION_STAGES.findIndex(s => s.id === def.unlockStage)
    if (curIdx < reqIdx) return
    const cost = specialHireCost(def, state)
    if (state.money < cost * 3) return
    dispatch({ type: 'HIRE_SPECIAL', payload: def.id })
    metrics.specialsHired++
    note(`HIRE_SPECIAL ${def.id} @ money=$${state.money} cost=$${cost}`)
  },
  tryUpgrade() { /* never upgrade */ },
  tryAcceptContracts() {
    if (state.gameOver) return
    if (!state.specials?.sales?.hired) return // turtle never hires sales, so this is dead
    const cap = maxConcurrentContracts(state)
    const list = activeContractsList(state)
    if (list.length >= cap) return
    for (const tpl of CONTRACT_TEMPLATES) {
      if (!contractUnlocked(tpl, state)) continue
      if (list.some(c => c.id === tpl.id)) continue
      const scaled = scaledContract(tpl, state)
      if (state.money < scaled.deposit * 2) continue
      // Fits existing inventory? Need units already past audit/repair.
      if (!contractFulfillable(scaled, state)) continue
      dispatch({ type: 'ACCEPT_CONTRACT', payload: tpl.id })
      note(`CONTRACT accept ${tpl.id} (fits inventory)`)
      break
    }
  },
  tryResolveEvent() { return defaultProfile.tryResolveEvent() },
  tryShip() { return defaultProfile.tryShip() },
}

// ─── Idle: AFK-ish. Infrequent checks, minimal hires. ────────────────────────

const idleProfile = {
  name: 'idle',
  _lastLotCheckAt: -Infinity,
  _lastPartsCheckAt: -Infinity,
  tryBuyLot() {
    if (state.gameOver) return
    if (fakeNow - this._lastLotCheckAt < 60_000) return
    this._lastLotCheckAt = fakeNow
    const perUnit = currentLotCostEstimate()
    const stage = currentExpansion(state)
    const sizes = stage.lots || [1]
    const smallest = sizes[0]
    const estCost = perUnit * smallest * 0.7
    if (state.money <= estCost * 1.5) return
    dispatch({ type: smallest > 1 ? 'BUY_LOT' : 'BUY', payload: smallest > 1 ? smallest : {} })
  },
  tryHireWorkers() {
    if (state.gameOver) return
    // Hire the *first* worker of each role when unlocked + cash allows. Never multi-hire.
    const order = ['auditor', 'tech', 'packer', 'cleaner', 'imager', 'desktopTech']
    for (const id of order) {
      const def = WORKER_DEFS.find(d => d.id === id)
      if (!def) continue
      if (!workerStageUnlocked(def, state)) continue
      if (state.sold < (def.unlockSold || 0)) continue
      const w = state.workers[def.id] || { count: 0, level: 1 }
      if (w.count >= 1) continue // never multi-hire
      const cost = workerHireCost(def, w.count, state)
      if (state.money < cost) continue
      dispatch({ type: 'HIRE_WORKER', payload: def.id })
      metrics.workersHired++
      note(`HIRE ${def.id} #1 @ money=$${state.money}`)
      return
    }
  },
  tryOrderParts() {
    if (state.gameOver) return
    if (fakeNow - this._lastPartsCheckAt < 30_000) return
    this._lastPartsCheckAt = fakeNow
    if ((state.parts || 0) > 0) return
    const incomingParts = (state.partsIncoming || []).reduce((n, o) => n + o.qty, 0)
    if (incomingParts > 0) return
    const ebay = PART_SOURCES.find(s => s.id === 'ebay')
    if (!ebay) return
    if (state.money < ebay.cost) return
    dispatch({ type: 'ORDER_PARTS', payload: 'ebay' })
  },
  tryHireSpecials() {
    if (state.gameOver) return
    // Only Floor Manager — once we hit Shop.
    const def = SPECIAL_HIRES.find(d => d.id === 'manager')
    if (!def) return
    const sp = state.specials[def.id]
    if (sp?.hired) return
    const curIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
    const reqIdx = EXPANSION_STAGES.findIndex(s => s.id === def.unlockStage)
    if (curIdx < reqIdx) return
    const cost = specialHireCost(def, state)
    if (state.money < cost) return
    dispatch({ type: 'HIRE_SPECIAL', payload: def.id })
    metrics.specialsHired++
    note(`HIRE_SPECIAL ${def.id} @ money=$${state.money} cost=$${cost}`)
  },
  tryUpgrade() { /* never upgrade */ },
  tryAcceptContracts() { /* ignore contracts entirely */ },
  tryResolveEvent() {
    // Auto-resolve only if FM L3 is doing it; otherwise ignore events.
    // The reducer/game loop handles FM L3 auto-resolve internally, so we do nothing here.
    // For event timeouts, just let them linger (they have their own mechanics).
    return
  },
  tryShip() { return defaultProfile.tryShip() },
}

const PROFILES = {
  default: defaultProfile,
  aggressive: aggressiveProfile,
  hoarder: hoarderProfile,
  idle: idleProfile,
}
const profile = PROFILES[PROFILE]

// ─── Manual action driver (when no worker hired for that role, *you* do it)
// Single-threaded: player can only do one manual action at a time.
let manualBusyUntil = 0
let manualNext = null // { def, unit, isRepair, sup }

function simulateManual() {
  if (state.gameOver) return
  if (manualBusyUntil > fakeNow) return
  // Step through the pipeline in order: audit -> repair -> image -> clean -> pack
  // Only do manual for roles that don't have a worker hired.
  const manualOrder = [
    { role: 'auditor', input: 'unchecked', baseDur: DURATIONS.audit, type: 'COMPLETE_AUDIT' },
    { role: 'tech',    input: 'audited',   baseDur: DURATIONS.repair, type: 'COMPLETE_REPAIR', isRepair: true },
    { role: 'imager',  input: 'repaired',  baseDur: DURATIONS.image, type: 'COMPLETE_IMAGE' },
    { role: 'cleaner', input: 'imaged',    baseDur: DURATIONS.clean, type: 'COMPLETE_CLEAN' },
    { role: 'packer',  input: 'cleaned',   baseDur: DURATIONS.pack,  type: 'COMPLETE_PACK' },
  ]
  for (const step of manualOrder) {
    const hasWorker = (state.workers?.[step.role]?.count || 0) > 0
    if (hasWorker) continue // workers handle this role
    const queue = state.pipeline[step.input] || []
    if (queue.length === 0) continue
    const unit = queue[0]
    if (step.isRepair) {
      const needed = partsNeeded(unit.quality)
      if ((state.parts || 0) < needed) continue
      dispatch({ type: 'CONSUME_PARTS', payload: needed })
    }
    const sup = unit?.supplierId ? supplierFromId(unit.supplierId) : null
    const supMult =
      step.role === 'auditor' ? (sup?.auditMult || 1) :
      step.role === 'cleaner' ? (sup?.cleanMult || 1) : 1
    const bonus = step.isRepair ? (unit.repairBonusMs || 0) : 0
    const typeMult = step.isRepair ? (unit.repairMult || 1) : 1
    const duration = Math.max(500, step.baseDur * typeMult * supMult + bonus)
    manualBusyUntil = fakeNow + duration
    manualNext = { step, unit, sup }
    return
  }
}

function drainManual() {
  if (!manualNext || manualBusyUntil > fakeNow) return
  const { step, unit, sup } = manualNext
  manualNext = null
  if (step.role === 'auditor') {
    dispatch({ type: 'COMPLETE_AUDIT', payload: rollAuditEvents(unit.quality, state) })
  } else if (step.isRepair) {
    const invLvl = state.specials?.inventory?.hired ? (state.specials.inventory.level || 1) : 0
    dispatch({ type: 'COMPLETE_REPAIR', payload: { ...rollRepairEvents(invLvl, sup?.scrapMult || 1), unitId: unit.id } })
  } else {
    dispatch({ type: step.type })
  }
}

// ─── Worker "tick": simulate one action per role based on slot availability ──
function simulateWorkers() {
  for (const def of WORKER_DEFS) {
    const w = state.workers[def.id]
    if (!w || w.count < 1) continue
    const slots = roleSlotFreeAt[def.id] = roleSlotFreeAt[def.id] || []
    while (slots.length < w.count) slots.push(0)
    slots.length = w.count

    for (let i = 0; i < slots.length; i++) {
      if (slots[i] > fakeNow) continue // busy
      const queue = state.pipeline[def.input] || []
      let unit = null
      for (let j = 0; j < queue.length; j++) {
        if (!workerAcceptsUnit(def, queue[j], state)) continue
        unit = queue[j]
        break
      }
      if (!unit) continue

      const isRepair = def.id === 'tech' || def.id === 'desktopTech'
      if (isRepair) {
        const needed = partsNeeded(unit.quality)
        if ((state.parts || 0) < needed) continue // tech idle waiting on parts
        dispatch({ type: 'CONSUME_PARTS', payload: needed })
      }

      const speedMult = globalSpeedMult(state)
      const sup = unit?.supplierId ? supplierFromId(unit.supplierId) : null
      const invLvlFast = state.specials?.inventory?.hired ? (state.specials.inventory.level || 1) : 0
      const headAuditLvl = state.specials?.headAuditor?.hired ? (state.specials.headAuditor.level || 1) : 0
      const invRepairMult = isRepair ? ([1, 0.90, 0.80, 0.70][invLvlFast] || 1) : 1
      const headAuditMult = def.id === 'auditor' ? ([1, 0.75, 0.60, 0.50][headAuditLvl] || 1) : 1
      const supMult =
        def.id === 'auditor' ? (sup?.auditMult || 1) * headAuditMult :
        def.id === 'cleaner' ? (sup?.cleanMult || 1) : 1
      const typeMult = isRepair ? (unit?.repairMult || 1) * invRepairMult : 1
      const bonus = isRepair ? (unit?.repairBonusMs || 0) : 0
      const duration = Math.max(500, ((workerDuration(def.baseDuration, w.level) * typeMult * supMult + bonus) / speedMult))
      slots[i] = fakeNow + duration

      if (!pendingCompletions.length || pendingCompletions[pendingCompletions.length - 1].at <= slots[i]) {
        pendingCompletions.push({ at: slots[i], def, unit, isRepair, sup })
      } else {
        pendingCompletions.push({ at: slots[i], def, unit, isRepair, sup })
        pendingCompletions.sort((a, b) => a.at - b.at)
      }
    }
  }
}

const pendingCompletions = []

function drainCompletions() {
  while (pendingCompletions.length && pendingCompletions[0].at <= fakeNow) {
    const { def, unit, isRepair, sup } = pendingCompletions.shift()
    if (def.id === 'auditor') {
      const ev = rollAuditEvents(unit.quality, state)
      dispatch({ type: 'COMPLETE_AUDIT', payload: ev })
    } else if (isRepair) {
      const invLvl = state.specials?.inventory?.hired ? (state.specials.inventory.level || 1) : 0
      dispatch({ type: 'COMPLETE_REPAIR', payload: { ...rollRepairEvents(invLvl, sup?.scrapMult || 1), unitId: unit.id } })
    } else {
      dispatch({ type: def.actionType })
    }
  }
}

// ─── 5. Misc tickers (mirror App.jsx cadences compressed into 100ms loop) ────
let lastPartsCheckAt = 0
let lastLotCheckAt = 0
let lastEventCheckAt = 0
let lastDripAt = 0
let lastPayrollTickAt = 0
let lastBankruptCheckAt = 0
let bankruptSince = null

function tickTimers() {
  // Lot drip every 200ms
  if (fakeNow - lastDripAt >= 200) {
    lastDripAt = fakeNow
    const inc = state.pipeline?.incoming || []
    if (inc.length) {
      const step = inc.length > 30 ? 3 : inc.length > 12 ? 2 : 1
      dispatch({ type: 'DRIP_INCOMING', payload: step })
    }
  }
  // Parts delivery
  if (fakeNow - lastPartsCheckAt >= 500) {
    lastPartsCheckAt = fakeNow
    if ((state.partsIncoming || []).some(o => o.arriveAt <= fakeNow)) {
      dispatch({ type: 'RECEIVE_PARTS' })
    }
  }
  // Lot delivery
  if (fakeNow - lastLotCheckAt >= 500) {
    lastLotCheckAt = fakeNow
    if ((state.lotsIncoming || []).some(o => o.arriveAt <= fakeNow)) {
      dispatch({ type: 'RECEIVE_LOT' })
    }
  }
  // Payroll + morale + buff cycle
  if (fakeNow - lastPayrollTickAt >= 1000) {
    lastPayrollTickAt = fakeNow
    if ((state.buffs || []).some(b => b.expiresAt <= fakeNow)) {
      dispatch({ type: 'PRUNE_BUFFS' })
    }
    if ((state.lastMoraleDecayAt || fakeNow) + 60_000 <= fakeNow) {
      dispatch({ type: 'MORALE_DECAY' })
    }
    if ((state.lastPayrollAt || fakeNow) + 60_000 <= fakeNow) {
      const moneyBefore = state.money
      const due = wageDue(state)
      dispatch({ type: 'RUN_PAYROLL' })
      if (due > 0 && moneyBefore < due) {
        metrics.missedPayrolls++
        note(`PAYROLL missed: due=$${due} had=$${moneyBefore}`)
      }
    }
  }
  // Event ticker (10s poll, 60s cooldown, 40% fire)
  if (fakeNow - lastEventCheckAt >= 10_000) {
    lastEventCheckAt = fakeNow
    if (!state.activeEvent && fakeNow - (state.lastEventAt || 0) >= 60_000 && Math.random() < 0.40) {
      const ev = pickDecisionEvent(state)
      if (ev) dispatch({ type: 'FIRE_EVENT', payload: ev.id })
    }
  }
  // Active contract timeout check
  for (const ac of activeContractsList(state)) {
    const left = contractTimeLeft(state, ac)
    if (left === 0) {
      dispatch({ type: 'FAIL_CONTRACT', payload: ac.id })
      note(`CONTRACT timed out: ${ac.id}`)
    } else if (contractAllMet(state, ac)) {
      dispatch({ type: 'COMPLETE_CONTRACT', payload: ac.id })
      note(`CONTRACT complete: ${ac.id}`)
    }
  }
  // Bankruptcy detector
  if (fakeNow - lastBankruptCheckAt >= 3000) {
    lastBankruptCheckAt = fakeNow
    if (state.gameOver) { bankruptSince = null }
    else if (!isBankrupt(state)) { bankruptSince = null }
    else {
      if (bankruptSince == null) bankruptSince = fakeNow
      else if (fakeNow - bankruptSince > 5000) {
        dispatch({ type: 'GAME_OVER' })
        metrics.gameOver = true
        note(`GAME OVER (bankrupt): money=$${state.money} parts=${state.parts}`)
        bankruptSince = null
      }
    }
  }
}

// ─── 6. Main loop ─────────────────────────────────────────────────────────────
let lastSoldStage = state.expansionStage
let lastSold = state.sold
let lastMoneyChangeAt = fakeNow
let lastMoney = state.money
let lastSoldChangeAt = fakeNow
let boringStretches = []
let currentBoringStart = null

console.log('=== PLAYTEST START ===')
console.log(`Profile: ${profile.name.toUpperCase()}`)
console.log(`Sim duration: ${SIM_MINUTES} minutes (${SIM_END - START_EPOCH}ms simulated)`)

try {
  while (fakeNow < SIM_END) {
    // Ordered work for this sim-tick
    tickTimers()
    drainCompletions()
    drainManual()
    simulateWorkers()
    simulateManual()

    // Heuristic actions fire every ~500ms
    if ((fakeNow - START_EPOCH) % 500 < TICK_MS) {
      profile.tryResolveEvent()
      profile.tryBuyLot()
      profile.tryOrderParts()
      profile.tryHireWorkers()
      profile.tryHireSpecials()
      profile.tryUpgrade()
      profile.tryAcceptContracts()
      profile.tryShip()
      // Paid expansion: accept as soon as affordable (keeps playtest progressing through stages).
      const nextIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage) + 1
      const nextStage = EXPANSION_STAGES[nextIdx]
      if (nextStage && state.sold >= nextStage.soldNeeded && state.money >= (nextStage.cost || 0) + 50) {
        dispatch({ type: 'EXPAND_ACCEPT' })
      }
    }

    // Stage-change stamps
    if (state.expansionStage !== lastSoldStage) {
      note(`STAGE upgrade: ${lastSoldStage} -> ${state.expansionStage} at sold=${state.sold}`)
      const tMs = fakeNow - START_EPOCH
      if (state.expansionStage === 'shop' && metrics.timeToShop == null) metrics.timeToShop = tMs
      if (state.expansionStage === 'warehouse' && metrics.timeToWarehouse == null) metrics.timeToWarehouse = tMs
      if (state.expansionStage === 'company' && metrics.timeToCompany == null) metrics.timeToCompany = tMs
      lastSoldStage = state.expansionStage
    }

    if (state.money !== lastMoney) { lastMoneyChangeAt = fakeNow; lastMoney = state.money }
    if (state.sold !== lastSold) { lastSoldChangeAt = fakeNow; lastSold = state.sold }

    // Track stockouts (parts==0 when there IS work waiting on parts)
    metrics.totalTicks++
    const hasRepairWork = (state.pipeline.audited?.length || 0) > 0
    if (hasRepairWork && (state.parts || 0) === 0) metrics.partsZeroTicks++

    // Boring stretch detector (>120s without sold OR money change)
    const idleMs = Math.min(fakeNow - lastMoneyChangeAt, fakeNow - lastSoldChangeAt)
    if (idleMs > 120_000) {
      if (currentBoringStart == null) currentBoringStart = lastMoneyChangeAt
      if (idleMs > metrics.longestBoringMs) metrics.longestBoringMs = idleMs
      boringStretches.push({ t: fakeNow - START_EPOCH, money: state.money, sold: state.sold, parts: state.parts, dur: idleMs })
      lastMoneyChangeAt = fakeNow; lastSoldChangeAt = fakeNow
      currentBoringStart = null
    }

    // Snapshot every 10 sim seconds
    if (fakeNow - lastSnapshotAt >= SNAPSHOT_MS) {
      lastSnapshotAt = fakeNow
      snapshots.push({
        tSec: Math.round((fakeNow - START_EPOCH) / 1000),
        money: state.money,
        sold: state.sold,
        parts: state.parts,
        stage: state.expansionStage,
        morale: moraleUnlocked(state) ? state.morale : null,
        unchecked: state.pipeline.unchecked.length,
        audited: state.pipeline.audited.length,
        repaired: state.pipeline.repaired.length,
        imaged: state.pipeline.imaged.length,
        cleaned: state.pipeline.cleaned.length,
        packed: state.pipeline.packed.length,
        scrap: state.pipeline.scrapped.length,
        incoming: state.pipeline.incoming.length,
        lotsIncoming: (state.lotsIncoming || []).length,
        partsIncoming: (state.partsIncoming || []).length,
        workers: Object.fromEntries(Object.entries(state.workers).map(([k, v]) => [k, v.count])),
        wageDue: wageDue(state),
        gameOver: !!state.gameOver,
      })
    }

    fakeNow += TICK_MS
  }
  note(`SIM END: fakeNow reached ${(fakeNow - START_EPOCH) / 60000}min`)
} catch (e) {
  note(`FATAL: ${e.stack || e.message}`)
  console.error(e)
}

// ─── 7. Report ────────────────────────────────────────────────────────────────
const stockoutPct = metrics.totalTicks ? (metrics.partsZeroTicks / metrics.totalTicks) * 100 : 0
const totalWorkerCount = Object.values(state.workers).reduce((n, v) => n + (v?.count || 0), 0)
const totalSpecialsCount = Object.values(state.specials).filter(v => v?.hired).length

console.log('\n=== SUMMARY ===')
console.log(`Profile: ${profile.name.toUpperCase()}`)
console.log(`Completed: ${state.gameOver ? 'GAME OVER' : 'yes'} (sim-min elapsed: ${((fakeNow - START_EPOCH) / 60000).toFixed(2)})`)
console.log(`Final money: $${state.money.toLocaleString()}`)
console.log(`Final sold:  ${state.sold}`)
console.log(`Final stage: ${state.expansionStage}`)
console.log(`Final parts: ${state.parts}`)
console.log(`Final morale: ${state.morale} (unlocked=${moraleUnlocked(state)})`)
console.log(`Total earned: $${state.totalEarned.toLocaleString()} · spent: $${state.totalSpent.toLocaleString()} · fees: $${(state.totalFees || 0).toLocaleString()}`)
console.log(`Workers (count): ${JSON.stringify(Object.fromEntries(Object.entries(state.workers).map(([k,v]) => [k, v.count])))}`)
console.log(`Specials hired: ${Object.entries(state.specials).filter(([_,v]) => v.hired).map(([k,v]) => `${k}(L${v.level})`).join(', ') || '(none)'}`)
console.log(`Pipeline (u/a/r/i/c/p/scrap): ${state.pipeline.unchecked.length}/${state.pipeline.audited.length}/${state.pipeline.repaired.length}/${state.pipeline.imaged.length}/${state.pipeline.cleaned.length}/${state.pipeline.packed.length}/${state.pipeline.scrapped.length}`)
console.log(`Total dispatches: ${totalDispatches}`)

console.log('\n=== PROFILE METRICS ===')
const fmt = (ms) => ms == null ? 'not-reached' : `${(ms/1000).toFixed(1)}s (${(ms/60000).toFixed(2)}m)`
console.log(`  Time-to-Shop:        ${fmt(metrics.timeToShop)}`)
console.log(`  Time-to-Warehouse:   ${fmt(metrics.timeToWarehouse)}`)
console.log(`  Time-to-Company:     ${fmt(metrics.timeToCompany)}`)
console.log(`  Workers hired total: ${metrics.workersHired} (current active=${totalWorkerCount})`)
console.log(`  Specials hired:      ${metrics.specialsHired} (current=${totalSpecialsCount})`)
console.log(`  Missed payrolls:     ${metrics.missedPayrolls}`)
console.log(`  Game over (bust):    ${metrics.gameOver ? 'YES' : 'no'}`)
console.log(`  Longest boring run:  ${(metrics.longestBoringMs/1000).toFixed(1)}s`)
console.log(`  Parts stockout %:    ${stockoutPct.toFixed(1)}% (${metrics.partsZeroTicks}/${metrics.totalTicks} ticks w/ repair queue + parts=0)`)

console.log('\n=== DISPATCH COUNTS ===')
for (const [k, v] of Object.entries(dispatchCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(24)} ${v}`)
}

console.log('\n=== KEY EVENTS ===')
for (const e of events) console.log(`  [${(e.t / 1000).toFixed(1)}s] ${e.msg}`)

console.log('\n=== SNAPSHOTS (every 10s) ===')
console.log('time  money     sold stage       parts pipe(u/a/r/i/c/p/s) inc/lotInc/partInc morale wages')
for (const s of snapshots) {
  const pipe = `${s.unchecked}/${s.audited}/${s.repaired}/${s.imaged}/${s.cleaned}/${s.packed}/${s.scrap}`
  const inc  = `${s.incoming}/${s.lotsIncoming}/${s.partsIncoming}`
  console.log(
    `${String(s.tSec).padStart(4)}s $${String(s.money).padStart(8)} ${String(s.sold).padStart(4)} ${s.stage.padEnd(11)} ${String(s.parts).padStart(3)}  ${pipe.padEnd(18)} ${inc.padEnd(10)} ${String(s.morale ?? '-').padStart(4)}   ${s.wageDue}`
  )
}

if (boringStretches.length) {
  console.log('\n=== BORING STRETCHES (>120s no sold/money change) ===')
  for (const b of boringStretches) console.log(`  [${(b.t/1000).toFixed(0)}s] money=$${b.money} sold=${b.sold} parts=${b.parts}`)
}

// Softlock sniff: at end, stuck tech queue with no parts, no money, no incoming?
const p = state.pipeline
const stuck = {
  techQueueNoParts:   (p.audited?.length || 0) > 0 && (state.parts || 0) === 0 && state.money < 25 && (state.partsIncoming || []).length === 0,
  pipelineEmptyBroke: state.money < 13 && Object.values(p).every(a => a.length === 0) && (state.lotsIncoming || []).length === 0,
}
console.log('\n=== SOFTLOCK SNIFF (end-state) ===')
console.log(JSON.stringify(stuck, null, 2))

console.log('\n=== LAST 20 GAME LOG ENTRIES ===')
const { tf: _tf } = await import('../src/i18n.js')
for (const e of (state.log || []).slice(0, 20)) {
  const txt = e.key ? _tf(e.key, 'en', e.args || {}) : (e.msg || '(empty)')
  console.log(`  ${e.t} ${txt}${e.count > 1 ? ` (×${e.count})` : ''}`)
}

// Restore real Date.now (cosmetic)
Date.now = realDateNow
console.log('\n=== DONE ===')
