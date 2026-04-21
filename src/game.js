let _uid = Date.now()
function uid() { return _uid++ }
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a }

// ── Suppliers ─────────────────────────────────────────────────────────────────

export const SUPPLIERS = [
  {
    id: 'local',
    label: 'Local Dealer',
    icon: '🏠',
    desc: 'Reliable quality. Higher prices. Fast delivery. Saves audit/repair time.',
    priceMult: 1.4,
    quality: { good: 0.35, fair: 0.50, bad: 0.15 },
    stars: 3,
    events: [],
    auditMult: 0.70,   // -30% audit time
    cleanMult: 1.00,
    scrapMult: 0.50,   // -50% scrap chance
    lotDiscBonus: 0,
    deliverySec: 5,
    unlockStage: 'garage',
  },
  {
    id: 'wholesale',
    label: 'Wholesale',
    icon: '🚢',
    desc: 'Standard mix. Extra 5% off lot purchases.',
    priceMult: 1.0,
    quality: { good: 0.15, fair: 0.45, bad: 0.40 },
    stars: 2,
    events: [],
    auditMult: 1.00,
    cleanMult: 1.00,
    scrapMult: 1.00,
    lotDiscBonus: 0.05,
    deliverySec: 10,
    unlockStage: 'garage',
  },
  {
    id: 'returns',
    label: 'Store Returns',
    icon: '📦',
    desc: 'Retail return pallets. Cheap, wild variance, chance of sealed bonus unit.',
    priceMult: 0.80,
    quality: { good: 0.40, fair: 0.20, bad: 0.40 },
    stars: 2,
    events: [
      { chance: 0.10, key: 'log.supplier.returnSlips' },
    ],
    auditMult: 1.00,
    cleanMult: 1.00,
    scrapMult: 1.00,
    lotDiscBonus: 0,
    sealedChance: 0.25,  // 25% chance per lot: +1 bonus sealed unit
    deliverySec: 15,
    unlockStage: 'shop',
  },
  {
    id: 'shenzhen',
    label: 'Shenzhen Special',
    icon: '🐉',
    desc: 'Dirt cheap. Dirty. Slow boat from overseas. Occasionally amazing.',
    priceMult: 0.60,
    quality: { good: 0.05, fair: 0.20, bad: 0.75 },
    stars: 1,
    events: [
      { chance: 0.20, key: 'log.supplier.testedWorking' },
      { chance: 0.12, key: 'log.supplier.customsHold' },
      { chance: 0.05, key: 'log.supplier.hiddenGem' },
    ],
    auditMult: 1.25,   // +25% audit time
    cleanMult: 1.50,   // +50% clean time
    scrapMult: 1.50,   // +50% scrap chance
    lotDiscBonus: 0,
    deliverySec: 25,
    unlockStage: 'garage',
  },
]

export function supplierUnlocked(sup, state) {
  const curIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
  const reqIdx = EXPANSION_STAGES.findIndex(s => s.id === sup.unlockStage)
  return curIdx >= reqIdx
}

export function supplierFromId(id) {
  return SUPPLIERS.find(s => s.id === id) || SUPPLIERS[1]
}

// ── Device types ─────────────────────────────────────────────────────────────
// Each type multiplies baseline numbers: price (buy), sell, and repair time.
// unlockStage = first stage at which this type can show up in a lot.

export const DEVICE_TYPES = [
  { id: 'laptop',  label: 'Laptop',     icon: '💻', priceMult: 1.00, sellMult: 1.00, repairMult: 1.00, unlockStage: 'garage'    },
  { id: 'desktop', label: 'Desktop',    icon: '🖥️', priceMult: 0.55, sellMult: 0.70, repairMult: 0.50, unlockStage: 'garage'    },
  { id: 'tablet',  label: 'Tablet',     icon: '📱', priceMult: 1.30, sellMult: 1.60, repairMult: 1.50, unlockStage: 'shop'      },
  { id: 'gaming',  label: 'Gaming PC',  icon: '🎮', priceMult: 1.80, sellMult: 2.80, repairMult: 1.60, unlockStage: 'storefront' },
  { id: 'apple',   label: 'Apple',      icon: '🍎', priceMult: 2.20, sellMult: 3.00, repairMult: 1.80, unlockStage: 'company'   },
  { id: 'phone',   label: 'Phone',      icon: '📞', priceMult: 0.70, sellMult: 1.10, repairMult: 0.60, unlockStage: 'regional'  },
  { id: 'aio',     label: 'AIO',        icon: '🖼️', priceMult: 1.60, sellMult: 2.00, repairMult: 1.40, unlockStage: 'national'  },
  { id: 'monitor', label: 'Monitor',    icon: '📺', priceMult: 0.40, sellMult: 0.55, repairMult: 0.35, unlockStage: 'corporate' },
]

// Supplier preference — each dealer specializes.
// Only types unlocked at current stage are eligible.
// Missing/0 = this supplier doesn't carry that type at all. Higher = more likely.
const SUPPLIER_WEIGHTS = {
  // Local: boutique specialist — premium consumer gear, occasional gaming rig.
  local:     { laptop: 2, apple: 7, tablet: 2, gaming: 3 },
  // B2B Wholesale: fleet liquidations — desktops, AIOs, monitors, office laptops, rare gaming rigs.
  wholesale: { laptop: 3, desktop: 6, aio: 4, monitor: 3, gaming: 2 },
  // Retail Returns: consumer returns — phones, tablets, budget laptops, returned gaming builds.
  returns:   { laptop: 4, tablet: 5, phone: 5, gaming: 3 },
  // China Import (Shenzhen): bulk import — phones, monitors, tablets, cheap desktops.
  shenzhen:  { tablet: 5, phone: 6, monitor: 5, laptop: 1, desktop: 3 },
}

export function supplierCarries(supplier, stage) {
  const stageIdx = EXPANSION_STAGES.findIndex(s => s.id === stage)
  const weights  = SUPPLIER_WEIGHTS[supplier.id] || {}
  return DEVICE_TYPES.filter(d =>
    EXPANSION_STAGES.findIndex(s => s.id === d.unlockStage) <= stageIdx &&
    (weights[d.id] || 0) > 0
  )
}

function pickDeviceType(supplier, stage) {
  const stageIdx = EXPANSION_STAGES.findIndex(s => s.id === stage)
  const weights  = SUPPLIER_WEIGHTS[supplier.id] || SUPPLIER_WEIGHTS.wholesale
  // Only consider types this supplier actually carries (weight > 0) AND that are stage-unlocked.
  const carried  = DEVICE_TYPES.filter(d =>
    EXPANSION_STAGES.findIndex(s => s.id === d.unlockStage) <= stageIdx &&
    (weights[d.id] || 0) > 0
  )
  if (carried.length === 0) return DEVICE_TYPES[0]  // fallback: laptop
  const total = carried.reduce((sum, t) => sum + weights[t.id], 0)
  let roll    = Math.random() * total
  for (const t of carried) {
    roll -= weights[t.id]
    if (roll <= 0) return t
  }
  return carried[0]
}

export function typeInfo(id) {
  return DEVICE_TYPES.find(t => t.id === id) || DEVICE_TYPES[0]
}

function summarizeMix(units) {
  const counts = {}
  for (const u of units) counts[u.type] = (counts[u.type] || 0) + 1
  return Object.entries(counts).map(([id, n]) => `${typeInfo(id).icon}×${n}`).join(' ')
}

// ── Unit factory ──────────────────────────────────────────────────────────────

export function createLaptop(supplier = SUPPLIERS[1], stage = 'garage', typeId = null) {
  const { good, fair } = supplier.quality
  const roll = Math.random()
  let quality, buyPrice, sellBase

  if (roll < good) {
    quality = 'good'; buyPrice = randInt(15, 28); sellBase = randInt(55, 90)
  } else if (roll < good + fair) {
    quality = 'fair'; buyPrice = randInt(8, 18); sellBase = randInt(30, 54)
  } else {
    quality = 'bad'; buyPrice = randInt(3, 10); sellBase = randInt(18, 32)
  }

  const t = typeId
    ? (DEVICE_TYPES.find(d => d.id === typeId) || DEVICE_TYPES[0])
    : pickDeviceType(supplier, stage)
  return {
    id: uid(),
    type: t.id,
    quality,
    buyPrice:  Math.max(5, Math.round(buyPrice * supplier.priceMult * t.priceMult)),
    sellPrice: Math.max(3, Math.round(sellBase * t.sellMult)),
    repairBonusMs: 0,
    imageBonusMs: 0,
    repairMult: t.repairMult,
    supplierId: supplier.id,
  }
}

// Estimated per-unit buy price for a type from a supplier (for shop display).
export function estimatedBuyPrice(supplier, typeId) {
  const t = DEVICE_TYPES.find(d => d.id === typeId) || DEVICE_TYPES[0]
  // Use midpoint of fair quality as a representative estimate
  const mid = 13
  return Math.max(2, Math.round(mid * supplier.priceMult * t.priceMult))
}

export const QUALITY_INFO = {
  good: { label: 'Good', color: '#4caf50' },
  fair: { label: 'Fair', color: '#ff9800' },
  bad:  { label: 'Bad',  color: '#ef5350' },
}

// ── Timings ───────────────────────────────────────────────────────────────────

export const DURATIONS = {
  audit:  2000,
  repair: 3500,
  clean:  2000,
  image:  4000,
  pack:   2000,
  ship:    800,
}

// ── Random events ─────────────────────────────────────────────────────────────

const SKIP_REPAIR_CHANCE = { good: 0.90, fair: 0.50, bad: 0.05 }

const SKIP_REPAIR_KEY = {
  good: 'log.audit.skipGood',
  fair: 'log.audit.skipFair',
  bad:  'log.audit.skipBad',
}

const AUDIT_EVENTS = [
  { chances: { good: 0.04, fair: 0.15, bad: 0.35 }, key: 'log.audit.liquidDamage', repairBonusMs: 3000, sellMod: 0.85 },
  { chances: { good: 0.15, fair: 0.05, bad: 0.01 }, key: 'log.audit.highEnd',      sellMod: 1.8 },
  { chances: { good: 0.40, fair: 0.10, bad: 0.02 }, key: 'log.audit.cleanInside',  sellMod: 1.1 },
  { chances: { good: 0.02, fair: 0.05, bad: 0.12 }, key: 'log.audit.corruptBios',  imageBonusMs: 2000 },
]

const REPAIR_EVENTS = [
  { chance: 0.07, key: 'log.repair.madeWorse',       scrapped: true },
  { chance: 0.12, key: 'log.repair.chinaDelay',       sellMod: 0.90 },
  { chance: 0.10, key: 'log.repair.clean',            sellMod: 1.05 },
  { chance: 0.06, key: 'log.repair.missingScrew',     sellMod: 0.95 },
]

export function rollAuditEvents(quality, state = {}) {
  const f = state.facilities || {}
  // msgs stored as { key, args? } — resolved through i18n by the reducer.
  const r = { msgs: [], sellMod: 1, repairBonusMs: 0, imageBonusMs: 0, skipRepair: false }
  const haLvl = state.specials?.headAuditor?.hired ? (state.specials.headAuditor.level || 1) : 0

  // Head Auditor L2+: 10% chance a "bad" unit is actually "fair" on closer inspection.
  let effQuality = quality
  if (haLvl >= 2 && quality === 'bad' && Math.random() < 0.10) {
    effQuality = 'fair'
    r.sellMod *= 1.2
    r.msgs.push({ key: 'log.audit.rescuedBad' })
  }

  if (Math.random() < SKIP_REPAIR_CHANCE[effQuality]) {
    r.skipRepair = true
    r.msgs.push({ key: SKIP_REPAIR_KEY[effQuality] })
  }

  // Testing rig halves damaging-event chance; Head Auditor L3 halves again.
  const damageMult = (f.testingRig ? 0.5 : 1) * (haLvl >= 3 ? 0.5 : 1)

  for (const ev of AUDIT_EVENTS) {
    const isDamaging = ev.repairBonusMs || ev.imageBonusMs
    const chance     = ev.chances[effQuality] * (isDamaging ? damageMult : 1)
    if (Math.random() < chance) {
      r.msgs.push({ key: ev.key })
      if (ev.sellMod)       r.sellMod       *= ev.sellMod
      if (ev.repairBonusMs) r.repairBonusMs += ev.repairBonusMs
      if (ev.imageBonusMs)  r.imageBonusMs  += ev.imageBonusMs
    }
  }

  // Diagnostic lab: 25% chance a "fair" unit tests out as "good"
  if (f.diagnosticLab && quality === 'fair' && Math.random() < 0.25) {
    r.sellMod *= 1.4
    r.msgs.push({ key: 'log.audit.diagLabUpgrade' })
  }

  // Liquid damage overrides the quality-based skip
  if (r.repairBonusMs > 0) r.skipRepair = false

  return r
}

export function rollRepairEvents(invMgrLevel = 0, scrapMult = 1) {
  const r = { msgs: [], sellMod: 1, scrapped: false }
  // Inventory Mgr L1/L2/L3 → -40/-60/-80% chance on bad events
  const chanceMult = invMgrLevel >= 1 ? [0.6, 0.4, 0.2][invMgrLevel - 1] : 1
  for (const ev of REPAIR_EVENTS) {
    const evMult = ev.scrapped ? scrapMult : 1
    if (Math.random() < ev.chance * chanceMult * evMult) {
      r.msgs.push({ key: ev.key })
      if (ev.sellMod)  r.sellMod  *= ev.sellMod
      if (ev.scrapped) r.scrapped  = true
    }
  }
  return r
}

// Repair speed multiplier from Inventory Mgr (L1/2/3 → -10/-20/-30% duration)
export function invMgrRepairMult(state) {
  const m = state.specials?.inventory
  if (!m?.hired) return 1
  return [0.90, 0.80, 0.70][m.level - 1] || 1
}

// Parts-salvage chance on a failed repair (L2 50%, L3 100%)
export function invMgrSalvagePct(state) {
  const m = state.specials?.inventory
  if (!m?.hired) return 0
  return [0, 0.5, 1.0][m.level - 1] || 0
}

// ── Parts ─────────────────────────────────────────────────────────────────────

export const PART_SOURCES = [
  {
    id: 'ebay',
    label: 'eBay Quick',
    icon: '🚚',
    qty: 5,
    cost: 15,
    deliverySec: 10,
    desc: 'Pay up for speed. Small batch, 10s delivery.',
  },
  {
    id: 'amazon',
    label: 'Amazon Warehouse',
    icon: '📦',
    qty: 10,
    cost: 35,
    deliverySec: 20,
    desc: 'Prime speed, decent price. 10 parts in 20s.',
    unlockStage: 'shop',
  },
  {
    id: 'china',
    label: 'China Bulk',
    icon: '🐉',
    qty: 20,
    cost: 40,
    deliverySec: 40,
    desc: 'Cheap parts, longer wait. 20 at a time.',
    unlockStage: 'shop',
  },
  {
    id: 'manufacturer',
    label: 'Manufacturer Direct',
    icon: '🏭',
    qty: 50,
    cost: 75,
    deliverySec: 90,
    desc: 'Wholesale pricing, long lead time. 50 parts.',
    unlockStage: 'warehouse',
  },
]

export function partsNeeded(quality) {
  return quality === 'bad' ? 2 : 1
}

export function partSourceUnlocked(src, state) {
  if (!src.unlockStage) return true
  const curIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
  const reqIdx = EXPANSION_STAGES.findIndex(s => s.id === src.unlockStage)
  return curIdx >= reqIdx
}

// ── Workers ───────────────────────────────────────────────────────────────────

// maxByStage: { garage, shop, warehouse, company, regional, national, corporate }
// Each entry = how many of this role you can have at that expansion stage.
export const WORKER_DEFS = [
  { id: 'auditor',     label: 'Auditor',      icon: '🔍', input: 'unchecked', actionType: 'COMPLETE_AUDIT',  hireCost: 75,  upgBase: 60,  baseDuration: DURATIONS.audit,  desc: 'Inspects incoming units',     unlockSold: 0,
    maxByStage: { garage: 1, shop: 2, storefront: 2, warehouse: 3, company: 4, regional: 4, national: 4, corporate: 5 } },
  { id: 'packer',      label: 'Packer',       icon: '📦', input: 'cleaned',   actionType: 'COMPLETE_PACK',   hireCost: 60,  upgBase: 40,  baseDuration: DURATIONS.pack,   desc: 'Packs units for shipping',    unlockSold: 3,
    maxByStage: { garage: 1, shop: 1, storefront: 2, warehouse: 2, company: 3, regional: 3, national: 3, corporate: 4 } },
  { id: 'tech',        label: 'Repair Tech',  icon: '🔧', input: 'audited',   actionType: 'COMPLETE_REPAIR', hireCost: 150, upgBase: 120, baseDuration: DURATIONS.repair, desc: 'Repairs damaged units',       unlockSold: 15, perHire: true,
    maxByStage: { garage: 1, shop: 1, storefront: 2, warehouse: 2, company: 2, regional: 3, national: 3, corporate: 4 } },
  { id: 'desktopTech', label: 'Desktop Tech', icon: '🖥️', input: 'audited',   actionType: 'COMPLETE_REPAIR', hireCost: 180, upgBase: 140, baseDuration: DURATIONS.repair, desc: 'Volume specialist — 50% faster on desktops, AIOs & monitors',  unlockSold: 35, unlockStage: 'shop',
    maxByStage: { shop: 1, storefront: 1, warehouse: 2, company: 2, regional: 2, national: 2, corporate: 3 } },
  { id: 'utility',     label: 'Utility Tech', icon: '🧰', input: 'any',       actionType: 'UTILITY_ADVANCE',  hireCost: 120, upgBase: 80,  baseDuration: DURATIONS.audit,  desc: 'Flex hand. 1.5× slower, but covers any non-repair stage when primaries are busy.', unlockSold: 55, unlockStage: 'shop',
    maxByStage: { shop: 1, storefront: 1, warehouse: 2, company: 2, regional: 3, national: 3, corporate: 4 } },
  { id: 'cleaner',     label: 'Cleaner',      icon: '🧹', input: 'imaged',    actionType: 'COMPLETE_CLEAN',  hireCost: 75,  upgBase: 50,  baseDuration: DURATIONS.clean,  desc: 'Cleans & preps units',        unlockSold: 45,
    maxByStage: { garage: 1, shop: 2, storefront: 2, warehouse: 3, company: 4, regional: 5, national: 5, corporate: 5 } },
  { id: 'imager',      label: 'Imager',       icon: '💿', input: 'repaired',  actionType: 'COMPLETE_IMAGE',  hireCost: 100, upgBase: 80,  baseDuration: DURATIONS.image,  desc: 'Installs OS & software',      unlockSold: 75,
    maxByStage: { garage: 1, shop: 1, storefront: 2, warehouse: 2, company: 3, regional: 3, national: 3, corporate: 4 } },
]

// Desktop family: these route to desktopTech when Desktop Tech is hired.
const DESKTOP_FAMILY = new Set(['desktop', 'aio', 'monitor'])
export function isDesktopFamily(unit) {
  return DESKTOP_FAMILY.has(unit?.type || 'laptop')
}

// Returns true if this role may claim this unit from its input queue.
// Split logic: once a Desktop Tech is hired, the regular Tech role stops
// taking desktop-family units, and Desktop Tech only takes desktop-family.
export function workerAcceptsUnit(def, unit, state) {
  if (def.id === 'tech') {
    const dtCount = state.workers?.desktopTech?.count || 0
    if (dtCount > 0 && isDesktopFamily(unit)) return false
    return true
  }
  if (def.id === 'desktopTech') return isDesktopFamily(unit)
  return true
}

// Workers with unlockStage (like desktopTech) are hidden until the stage is reached.
export function workerStageUnlocked(def, state) {
  if (!def.unlockStage) return true
  const curIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
  const reqIdx = EXPANSION_STAGES.findIndex(s => s.id === def.unlockStage)
  return curIdx >= reqIdx
}

export function upgradeCost(def, currentLevel) {
  if (currentLevel >= 5) return null
  return Math.round(def.upgBase * currentLevel * 1.6)
}

// Sold-count thresholds between upgrades (counted since hire or previous upgrade).
// Forces a crew to actually work at their current level before promotion.
export const UPGRADE_SOLD_THRESHOLDS = { 2: 8, 3: 20, 4: 40, 5: 80 }
export function upgradeGate(worker, state) {
  if (!worker || worker.count < 1) return { allowed: false, needed: 0, since: 0 }
  const baseLevel = workerLevel(worker)   // per-hire: uses the lowest hire's level
  const nextLevel = baseLevel + 1
  if (nextLevel > 5) return { allowed: false, needed: 0, since: 0 }
  const needed = UPGRADE_SOLD_THRESHOLDS[nextLevel] || 0
  const anchor = worker.upgradedAtSold ?? 0
  const since = (state.sold || 0) - anchor
  return { allowed: since >= needed, needed, since, remaining: Math.max(0, needed - since) }
}

// Level 1 = base speed, Level 5 = 3.5x faster
export function workerDuration(baseDuration, level) {
  const mult = [1.0, 0.75, 0.55, 0.40, 0.28]
  return Math.round(baseDuration * (mult[level - 1] || 0.28))
}

export function workerMaxCount(def, state) {
  return def.maxByStage?.[state.expansionStage] || 1
}

// Each additional hire costs more than the last (1.5x per step).
export function workerHireCost(def, currentCount, state) {
  const discount = state?.bonuses?.hireCostMult || 1
  return Math.round(def.hireCost * Math.pow(1.5, currentCount) * discount)
}

// ── Per-hire level helpers (tech only for now) ───────────────────────────────
// Tech stores individual hire levels in `hireLevels: [1, 1, 2]` (some techs
// are better than others). Other roles still use shared `level`. These helpers
// normalize reads so callers don't have to branch.

// Effective "group" level for a worker. For per-hire roles: the lowest hire
// level (the crew's floor). Promoting the weakest tech raises the floor.
export function workerLevel(worker) {
  if (!worker) return 1
  if (worker.hireLevels && worker.hireLevels.length > 0) {
    return Math.min(...worker.hireLevels)
  }
  return worker.level || 1
}

// Max level across all hires (for "everyone maxed?" checks).
export function workerMaxLevel(worker) {
  if (!worker) return 1
  if (worker.hireLevels && worker.hireLevels.length > 0) {
    return Math.max(...worker.hireLevels)
  }
  return worker.level || 1
}

// For the ticker: returns the level to use for the Nth active slot.
// Per-hire: sort hireLevels desc (best tech works first), index by slot.
// Non-per-hire: everyone shares the same level.
export function levelForSlot(worker, slotIdx) {
  if (!worker) return 1
  if (worker.hireLevels && worker.hireLevels.length > 0) {
    const sorted = [...worker.hireLevels].sort((a, b) => b - a)
    return sorted[slotIdx] ?? sorted[sorted.length - 1] ?? 1
  }
  return worker.level || 1
}

// Promotion target for a per-hire worker: index of the lowest-level hire.
// Returns -1 if not per-hire or everyone is maxed.
export function promotionTargetIndex(worker) {
  if (!worker?.hireLevels || worker.hireLevels.length === 0) return -1
  let lowIdx = -1
  let lowLvl = 6
  worker.hireLevels.forEach((lvl, i) => {
    if (lvl < lowLvl) { lowLvl = lvl; lowIdx = i }
  })
  return lowLvl >= 5 ? -1 : lowIdx
}

// ── Special hires (management) ───────────────────────────────────────────────

export const SPECIAL_HIRES = [
  {
    id: 'manager',
    label: 'Floor Manager',
    icon: '🧑‍💼',
    desc: 'Coordinates the floor. Auto-priority by contract, auto-reorders parts, L3 auto-resolves decision events.',
    hireCost: 500,
    upgBase: 600,
    maxLevel: 3,
    unlockStage: 'shop',
    effectLabel: lvl => [
      'Auto-priority · +10% speed',
      '+20% speed · auto-order parts',
      '+30% speed · auto-resolve events',
    ][lvl - 1],
  },
  {
    id: 'inventory',
    label: 'Inventory Manager',
    icon: '💻',
    desc: 'Tight repair QC. Fewer scraps, faster repairs, recovers wasted parts when repairs fail.',
    hireCost: 500,
    upgBase: 500,
    maxLevel: 3,
    unlockStage: 'warehouse',
    effectLabel: lvl => [
      '-40% scraps · -10% repair time',
      '-60% scraps · -20% repair · 50% parts salvage',
      '-80% scraps · -30% repair · parts never wasted',
    ][lvl - 1],
  },
  {
    id: 'sales',
    label: 'Sales Manager',
    icon: '📈',
    desc: 'Closes more, closes bigger. Also raises the concurrent-contract cap.',
    hireCost: 600,
    upgBase: 500,
    maxLevel: 3,
    unlockStage: 'company',
    effectLabel: lvl => [
      '+10% sell · 2 contracts',
      '+20% sell · 3 contracts · -15% channel fees',
      '+30% sell · 4 contracts · 5% bidding-war chance',
    ][lvl - 1],
  },
  {
    id: 'buyer',
    label: 'Purchasing Agent',
    icon: '🤝',
    desc: 'Vendor whisperer. Lot discounts and faster delivery. Chance at free shipping connections.',
    hireCost: 400,
    upgBase: 400,
    maxLevel: 3,
    unlockStage: 'shop',
    effectLabel: lvl => [
      '+10% lot discount',
      '+20% lot discount · -25% delivery time',
      '+25% lot discount · -50% delivery · 8% free-ship',
    ][lvl - 1],
  },
  {
    id: 'headAuditor',
    label: 'Head Auditor',
    icon: '🔍',
    desc: 'Runs the intake bench. Faster audits, reveals lot quality before buying, rescues mislabeled units.',
    hireCost: 650,
    upgBase: 550,
    maxLevel: 3,
    unlockStage: 'warehouse',
    effectLabel: lvl => [
      '-25% audit time · reveals lot quality %',
      '-40% audit · 10% bad→fair rescue',
      '-50% audit · -50% damaging audit events',
    ][lvl - 1],
  },
]

// Specials get more expensive as the operation scales — your time is worth more.
// Capped at 5× so late-game doesn't become absurd.
export function specialCostMult(state) {
  const sold = state?.sold || 0
  return 1 + Math.min(sold / 50, 4)
}

export function specialHireCost(def, state) {
  return Math.round(def.hireCost * specialCostMult(state))
}

// Bankruptcy: no path to income. Cash too low to buy any lot, no parts to
// repair, and nothing in the downstream pipeline or lots en route.
// Unchecked/audited units are given the benefit of the doubt — skip-repair
// audits can still pull them through.
export function isBankrupt(state) {
  if (state?.gameOver) return false // already showing — don't re-fire
  const money = state?.money ?? 0
  const parts = state?.parts ?? 0
  const p = state?.pipeline || {}
  const lotsIncoming = state?.lotsIncoming || []
  const hasFlowable =
    (p.repaired?.length || 0) > 0 ||
    (p.imaged?.length   || 0) > 0 ||
    (p.cleaned?.length  || 0) > 0 ||
    (p.packed?.length   || 0) > 0 ||
    (p.incoming?.length || 0) > 0
  if (hasFlowable) return false
  if (lotsIncoming.length > 0) return false
  // Cheapest new lot purchase — if they can't afford one unit they can't
  // restart the flow even with a part donation.
  const cheapestUnit = 10
  if (money >= cheapestUnit && parts > 0) return false
  if (money >= cheapestUnit * 2) return false // can buy and still have slack
  // If they have audited/unchecked units AND parts, they can still repair.
  const stuckPreRepair = (p.audited?.length || 0) + (p.unchecked?.length || 0) > 0
  if (stuckPreRepair && parts > 0) return false
  return true
}

// Floor Manager L3: auto-resolve decision events after a short delay.
export function floorMgrAutoResolves(state) {
  const fm = state?.specials?.manager
  return !!(fm?.hired && fm.level >= 3)
}

// Floor Manager (any level): types to prioritize based on the active contract's
// unmet demand. Returns sorted type list (largest remaining need first), or null
// if no FM / no contract / all types met.
export function contractPriorityTypes(state) {
  const fm = state?.specials?.manager
  if (!fm?.hired) return null
  const prog = contractProgress(state)
  if (!prog) return null
  const pending = Object.entries(prog)
    .filter(([, p]) => !p.done)
    .sort((a, b) => (b[1].need - b[1].have) - (a[1].need - a[1].have))
    .map(([type]) => type)
  return pending.length > 0 ? pending : null
}

export function specialUpgCost(def, currentLevel, state) {
  if (currentLevel >= def.maxLevel) return null
  const base = def.upgBase * currentLevel * 1.8
  return Math.round(base * specialCostMult(state || {}))
}

// ── Scrap pile economy ──────────────────────────────────────────────────────
// Failed repairs land in pipeline.scrapped. Player can bulk-process the pile:
//   • Part out      — salvage 2 parts per unit
//   • Sell for scrap — $8 per unit (always available)
//   • Sell as-is on eBay — 30% of sellPrice (unlocks at company stage)
export const SCRAP_PART_YIELD = 3
export const SCRAP_JUNK_PER_UNIT = 6
export const SCRAP_EBAY_MULT = 0.55

export function scrapEbayUnlocked(state) {
  const curIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
  const reqIdx = EXPANSION_STAGES.findIndex(s => s.id === 'company')
  return curIdx >= reqIdx
}

// ── Active buffs/debuffs (lasting event consequences) ───────────────────────
// state.buffs is an array of { id, icon, label, expiresAt, effect: { type, mult } }
// type: 'speed' | 'sell' | 'scrap' | 'hireCost' — mult >1 is a buff, <1 is a debuff.
export function activeBuffs(state, now = Date.now()) {
  return (state.buffs || []).filter(b => b && b.expiresAt > now)
}

export function buffMult(state, type, now = Date.now()) {
  let m = 1
  for (const b of activeBuffs(state, now)) {
    if (b.effect?.type === type) m *= b.effect.mult
  }
  return m
}

// ── Morale ──────────────────────────────────────────────────────────────────
// Unlocks once the crew gets bigger. Drives a speed multiplier on top of Floor
// Manager + buffs. Decays passively; events like pizza/coffee boost it.
export const MORALE_UNLOCK_HIRES = 4

export function totalHires(state) {
  return Object.values(state.workers || {}).reduce((n, w) => n + (w?.count || 0), 0)
}

export function moraleUnlocked(state) {
  return totalHires(state) >= MORALE_UNLOCK_HIRES
}

// Face emoji based on morale band
export function moraleFace(m) {
  if (m >= 85) return '🤩'
  if (m >= 65) return '😄'
  if (m >= 45) return '🙂'
  if (m >= 25) return '😐'
  return '😠'
}

// Linear mapping: 0 → 0.75x, 50 → 1.00x, 100 → 1.25x
export function moraleMult(state) {
  if (!moraleUnlocked(state)) return 1
  const m = Math.max(0, Math.min(100, state.morale ?? 60))
  return 0.75 + (m / 100) * 0.50
}

// Boss Mode: active ability. 90s burst of +150% speed + free parts. 6min cooldown.
export const BOSS_DURATION_MS = 90_000
export const BOSS_COOLDOWN_MS = 360_000
export const BOSS_SPEED_MULT  = 2.50

export function bossActive(state, now = Date.now()) {
  return (state?.bossUntil || 0) > now
}
export function bossCooldownLeft(state, now = Date.now()) {
  return Math.max(0, (state?.bossCooldownUntil || 0) - now)
}
export function bossReady(state, now = Date.now()) {
  return !bossActive(state, now) && bossCooldownLeft(state, now) <= 0
}

// Global speed multiplier from Floor Manager + active speed buffs + morale + Boss Mode
export function globalSpeedMult(state) {
  const m = state.specials?.manager
  const mgrMult = m?.hired ? ([1.10, 1.20, 1.30][m.level - 1] || 1) : 1
  const boss    = bossActive(state) ? BOSS_SPEED_MULT : 1
  return mgrMult * buffMult(state, 'speed') * moraleMult(state) * boss
}

// Sales bonus multiplier (Sales Manager + milestone bonuses + active sell buffs)
export function salesBonusMult(state) {
  const s = state.specials?.sales
  const salesMult = s?.hired ? ([1.10, 1.20, 1.30][s.level - 1] || 1) : 1
  return salesMult * (1 + (state.bonuses?.sell || 0)) * buffMult(state, 'sell')
}

// Sales Mgr L2+ trims channel fees by 15%
export function salesFeeMult(state) {
  const s = state.specials?.sales
  if (!s?.hired || s.level < 2) return 1
  return 0.85
}

// Sales Mgr L3 rolls a per-unit 5% bidding-war → 2x gross on that unit
export function rollBidWar(state) {
  const s = state.specials?.sales
  if (!s?.hired || s.level < 3) return false
  return Math.random() < 0.05
}

// Extra lot discount from purchasing agent
export function agentLotDiscount(state) {
  const a = state.specials?.buyer
  if (!a?.hired) return 0
  return [0.10, 0.20, 0.25][a.level - 1] || 0
}

// Purchasing Agent shrinks lot delivery time at L2+. Returns a 0..1 multiplier.
export function agentDeliveryMult(state) {
  const a = state.specials?.buyer
  if (!a?.hired) return 1
  return [1, 0.75, 0.50][a.level - 1] || 1
}

// Purchasing Agent L3 rolls for a "connection made" on every lot — extra discount, zero delivery
export function agentConnectionRoll(state) {
  const a = state.specials?.buyer
  if (!a?.hired || a.level < 3) return null
  if (Math.random() >= 0.08) return null
  return { extraDiscount: 0.10, instantShip: true }
}

// ── Expansion stages ──────────────────────────────────────────────────────────

export const EXPANSION_STAGES = [
  { id: 'garage',     label: 'Home Garage', icon: '🏠', soldNeeded: 0,     cost: 0,        grant: 0,       lots: [1]           },
  { id: 'shop',       label: 'Small Shop',  icon: '🏪', soldNeeded: 25,    cost: 200,      grant: 200,     lots: [1, 5, 10]    },
  { id: 'storefront', label: 'Storefront',  icon: '🏬', soldNeeded: 60,    cost: 900,      grant: 600,     lots: [1, 10, 15]   },
  { id: 'warehouse',  label: 'Warehouse',   icon: '🏭', soldNeeded: 120,   cost: 3000,     grant: 2000,    lots: [1, 10, 20]   },
  { id: 'company',    label: 'Company',     icon: '🏢', soldNeeded: 500,   cost: 7000,     grant: 3500,    lots: [1, 20, 50]   },
  { id: 'regional',   label: 'Regional HQ', icon: '🏙️', soldNeeded: 2000,  cost: 100000,   grant: 30000,   lots: [1, 50, 100]  },
  { id: 'national',   label: 'National Ops', icon: '🌆', soldNeeded: 10000, cost: 500000,   grant: 150000,  lots: [1, 100, 250] },
  { id: 'corporate',  label: 'Corporate',   icon: '🌐', soldNeeded: 50000, cost: 2500000,  grant: 700000,  lots: [1, 250, 500] },
]

// Discount per lot size
export const LOT_DISCOUNT = { 1: 0, 5: 0.20, 10: 0.30, 20: 0.40, 50: 0.50, 100: 0.55, 250: 0.60, 500: 0.65 }

export function currentExpansion(state) {
  return EXPANSION_STAGES.find(s => s.id === state.expansionStage) || EXPANSION_STAGES[0]
}

export function nextExpansion(state) {
  const idx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
  return EXPANSION_STAGES[idx + 1] || null
}

// Stage-anchored XP requirement: each tier requires you to *actually sell*
// roughly (nextThreshold - currentThreshold) units at the current stage before
// promotion unlocks. Prevents leapfrogging multiple tiers in a row once cash
// has stockpiled at a lower stage.
export function expansionSoldNeededAtStage(state) {
  const cur  = currentExpansion(state)
  const next = nextExpansion(state)
  if (!cur || !next) return 0
  return Math.max(0, next.soldNeeded - cur.soldNeeded)
}

export function expansionSoldAtStage(state) {
  // Anchor defaults to 0 on fresh saves. For old saves / migrations, if anchor
  // is lower than the current stage's own threshold, snap it up — otherwise
  // the XP bar can report "ready" (LINE B satisfied) while sold count still
  // lags LINE A, leaving a "full bar, no upgrade button" dead-state.
  const cur = currentExpansion(state)
  const rawAnchor = state.stageUpgradedAtSold ?? 0
  const anchor = Math.max(rawAnchor, cur?.soldNeeded || 0)
  return Math.max(0, (state.sold || 0) - anchor)
}

// True once the player has met BOTH: the sold threshold AND put in enough
// sold units at the current stage since entering it. Promotion is opt-in.
export function expansionReady(state) {
  const next = nextExpansion(state)
  if (!next) return null
  if ((state.sold || 0) < next.soldNeeded) return null
  if (expansionSoldAtStage(state) < expansionSoldNeededAtStage(state)) return null
  return next
}

export function canAffordExpansion(state) {
  const next = expansionReady(state)
  if (!next) return false
  return (state.money || 0) >= (next.cost || 0)
}

// For the in-progress UI: shows how close the player is to the tier's XP gate.
export function expansionXpProgress(state) {
  const need = expansionSoldNeededAtStage(state)
  const have = Math.min(need, expansionSoldAtStage(state))
  return { have, need, ready: need > 0 && have >= need, remaining: Math.max(0, need - have) }
}

// ── Facilities (one-time upgrades with passive effects) ──────────────────────

export const FACILITIES = [
  { id: 'idleGuard',      label: 'Idle Guard',      icon: '🛡️', cost: 800,   unlockStage: 'shop',      desc: 'Auto-orders parts when low (floor 5). Caps offline payroll at 15 min.' },
  { id: 'partsDepot',     label: 'Parts Depot',     icon: '🔩', cost: 3000,  unlockStage: 'shop',      desc: '+2 parts from scrap · -20% cost, -25% delivery on part orders' },
  { id: 'paintBooth',     label: 'Paint Booth',     icon: '🎨', cost: 2500,  unlockStage: 'shop',      desc: '+30% sell price on "bad" quality units' },
  { id: 'testingRig',     label: 'Testing Rig',     icon: '🧪', cost: 4000,  unlockStage: 'warehouse', desc: '-50% chance of damaging audit events' },
  { id: 'vinylCutter',    label: 'Vinyl Cutter',    icon: '✂️', cost: 6000,  unlockStage: 'warehouse', desc: '+20% sell price on Amazon (branding)' },
  { id: 'batteryStation', label: 'Battery Station', icon: '🔋', cost: 10000, unlockStage: 'company',   desc: '+15% sell price on laptops (refurb battery)' },
  { id: 'diagnosticLab',  label: 'Diagnostic Lab',  icon: '🔬', cost: 15000, unlockStage: 'company',   desc: '25% chance to upgrade "fair" → "good" at audit' },
  { id: 'photoStudio',    label: 'Photo Studio',    icon: '📸', cost: 25000, unlockStage: 'regional',  desc: '+10% sell price on eBay & Amazon' },
]

export function facilityUnlocked(f, state) {
  const curIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
  const reqIdx = EXPANSION_STAGES.findIndex(s => s.id === f.unlockStage)
  return curIdx >= reqIdx
}

// Sell-side multiplier from owned facilities, based on unit + active channel
export function facilitySellMult(state, laptop, channel) {
  let mult = 1
  const f = state.facilities || {}
  if (f.paintBooth     && laptop.quality === 'bad')                              mult *= 1.30
  if (f.batteryStation && laptop.type    === 'laptop')                           mult *= 1.15
  if (f.vinylCutter    && channel.id     === 'amazon')                           mult *= 1.20
  if (f.photoStudio    && (channel.id    === 'ebay' || channel.id === 'amazon')) mult *= 1.10
  if (state.bonuses?.amazonBoost && channel.id === 'amazon')                     mult *= 1.10
  return mult
}

// ── Sales channels ────────────────────────────────────────────────────────────

export const CHANNELS = [
  { id: 'ebay',      label: 'eBay',       icon: '🛒', desc: 'Baseline. Reliable, takes their cut.',    sellMult: 1.00, feePct: 0.13, unlockSold: 0 },
  { id: 'amazon',    label: 'Amazon',     icon: '📦', desc: 'Premium prices, premium fees.',           sellMult: 1.25, feePct: 0.18, unlockSold: 50 },
  { id: 'woot',      label: 'Woot',       icon: '⚡', desc: 'Flash-sale bulk. Low fees, low prices.',  sellMult: 0.85, feePct: 0.05, unlockSold: 200 },
  { id: 'wholesale', label: 'Wholesale',  icon: '🏢', desc: 'No fees. Flat wholesale price.',          sellMult: 0.75, feePct: 0,    unlockSold: 0, unlockStage: 'company'  },
  { id: 'gov',       label: 'Gov Contract', icon: '🏛️', desc: 'Fat bulk deals. Slow pay, no fees.',     sellMult: 1.10, feePct: 0,    unlockSold: 0, unlockStage: 'national' },
  { id: 'global',    label: 'Global Export', icon: '🌐', desc: 'Top dollar across borders. Heavy fees.', sellMult: 1.60, feePct: 0.22, unlockSold: 0, unlockStage: 'corporate' },
]

export function channelUnlocked(ch, state) {
  if (state.sold < (ch.unlockSold || 0)) return false
  if (ch.unlockStage) {
    const curIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
    const reqIdx = EXPANSION_STAGES.findIndex(s => s.id === ch.unlockStage)
    if (curIdx < reqIdx) return false
  }
  return true
}

export function activeChannel(state) {
  const ch = CHANNELS.find(c => c.id === state.activeChannel)
  return ch && channelUnlocked(ch, state) ? ch : CHANNELS[0]
}

// ── Decision events (random Reigns-style popups) ─────────────────────────────

// Helper: add N units of a specific quality to unchecked pipeline
function seedUnits(state, n, quality) {
  const sup = SUPPLIERS.find(x => x.id === state.activeSupplier) || SUPPLIERS[1]
  const units = Array.from({ length: n }, () => {
    const u = createLaptop(sup, state.expansionStage)
    return { ...u, quality }
  })
  return {
    ...state,
    pipeline: { ...state.pipeline, unchecked: [...state.pipeline.unchecked, ...units] },
    counters: { ...state.counters, bought: (state.counters?.bought || 0) + n },
  }
}

// Helper: advance N units through audit→repair (free labor)
function skipAheadRepairs(state, n) {
  const p = state.pipeline
  const moved = p.audited.slice(0, n)
  if (!moved.length) return mkLog(state, 'log.event.internNothing')
  return mkLog({
    ...state,
    pipeline: {
      ...p,
      audited:  p.audited.slice(moved.length),
      repaired: [...p.repaired, ...moved],
    },
    counters: { ...state.counters, repaired: (state.counters?.repaired || 0) + moved.length },
  }, 'log.event.internRepairs', { n: moved.length })
}

// Helper: scrap N audited units (they land in the scrap pile, not the void)
function scrapAudited(state, n) {
  const p = state.pipeline
  const lost = Math.min(n, p.audited.length)
  if (!lost) return state
  const moved = p.audited.slice(0, lost)
  let vendorStats = state.vendorStats
  for (const u of moved) if (u.supplierId) vendorStats = bumpVendor(vendorStats, u.supplierId, { scrapped: 1 })
  return {
    ...state,
    pipeline: { ...p, audited: p.audited.slice(lost), scrapped: [...(p.scrapped || []), ...moved] },
    counters: { ...state.counters, scrapped: (state.counters?.scrapped || 0) + lost },
    vendorStats,
  }
}

// Helper: add a lasting buff/debuff (replaces same id if already active)
function withBuff(state, buff) {
  const expiresAt = Date.now() + (buff.durationMs || 60000)
  const keep = (state.buffs || []).filter(x => x.id !== buff.id && x.expiresAt > Date.now())
  return { ...state, buffs: [...keep, { id: buff.id, icon: buff.icon, label: buff.label, expiresAt, effect: buff.effect }] }
}

// Helper: hit by percentage of current bankroll, clamped to [min, max]
function bankrollHit(s, pct, min, max) {
  const raw = Math.round(s.money * pct)
  return Math.min(max, Math.max(min, raw))
}

// ── Payroll ───────────────────────────────────────────────────────────────────
// Pay the crew every PAYROLL_INTERVAL. Full pay bumps morale; missed pay
// tanks it. Unlocks at Shop — Garage mode you're the only human on site.
export const PAYROLL_INTERVAL_MS = 60_000
// Grace period after a stage upgrade — push next payroll out so the big
// hire/upgrade spend after expanding doesn't instantly trigger a miss.
export const STAGE_PAYROLL_GRACE_MS = 120_000

export const WORKER_WAGES = {
  auditor:     5,
  packer:      4,
  tech:       10,
  desktopTech: 12,
  utility:      8,
  cleaner:      4,
  imager:       7,
}

export const SPECIAL_WAGES = {
  manager:     25,
  inventory:   20,
  sales:       25,
  buyer:       18,
  headAuditor: 22,
}

export function payrollUnlocked(state) {
  const curIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
  const reqIdx = EXPANSION_STAGES.findIndex(s => s.id === 'shop')
  return curIdx >= reqIdx
}

// Level bonus: +30% per level above 1 (L1=1.00, L2=1.30, L3=1.60)
function levelWageMult(level) {
  return 1 + 0.3 * (Math.max(1, level || 1) - 1)
}

export function wageDue(state) {
  if (!payrollUnlocked(state)) return 0
  let total = 0
  const w = state.workers || {}
  for (const [id, base] of Object.entries(WORKER_WAGES)) {
    const entry = w[id]
    if (!entry || !entry.count) continue
    total += base * entry.count * levelWageMult(entry.level)
  }
  const sp = state.specials || {}
  for (const [id, base] of Object.entries(SPECIAL_WAGES)) {
    const entry = sp[id]
    if (!entry?.hired) continue
    total += base * levelWageMult(entry.level)
  }
  return Math.round(total)
}

// Helper: bump morale by n points (clamped 0-100). No-op until morale is unlocked.
function bumpMorale(state, delta) {
  if (!moraleUnlocked(state)) return state
  const next = Math.max(0, Math.min(100, (state.morale ?? 60) + delta))
  return { ...state, morale: next }
}

// ── Multi-location shops ─────────────────────────────────────────────────────
// The *active* shop's fields live at the state root so the existing reducer
// keeps working unchanged. Inactive shops are stored as snapshots in
// `state.shops` keyed by shopId. SWITCH_SHOP swaps snapshots in/out.

export const SHOP_LOCAL_KEYS = [
  'pipeline', 'workers', 'specials',
  'parts', 'partsIncoming', 'lotsIncoming', 'lots',
  'facilities',
  'expansionStage',
  'morale', 'lastMoraleDecayAt',
  'activeChannel', 'activeSupplier',
  'priorityType',
]

export const SECOND_SHOP_COST = 50000
export const SECOND_SHOP_STAGE = 'warehouse'

export function extractShopState(state) {
  const out = {}
  for (const k of SHOP_LOCAL_KEYS) out[k] = state[k]
  return out
}

export function applyShopState(state, shop) {
  const out = { ...state }
  for (const k of SHOP_LOCAL_KEYS) out[k] = shop[k]
  return out
}

export function makeFreshShopState() {
  const fresh = makeInitialState()
  return extractShopState(fresh)
}

export function allShops(state) {
  // Active shop + inactive snapshots, in insertion order
  const activeId = state.activeShopId
  const snap = extractShopState(state)
  const list = []
  for (const shop of state.shops || []) {
    if (shop.id === activeId) list.push({ ...shop, ...snap })
    else list.push(shop)
  }
  return list
}

export function totalWageAcrossShops(state) {
  return allShops(state).reduce((n, shop) => {
    // Build a minimal virtual state for wageDue
    const virt = { ...state, workers: shop.workers, specials: shop.specials, expansionStage: shop.expansionStage }
    return n + wageDue(virt)
  }, 0)
}

export function secondShopUnlocked(state) {
  const curIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
  const reqIdx = EXPANSION_STAGES.findIndex(s => s.id === SECOND_SHOP_STAGE)
  return curIdx >= reqIdx
}

// ── Offline catch-up ─────────────────────────────────────────────────────────
// When the player returns after a break, simulate what the crew would have
// gotten done. Approximates throughput (count × time / duration per stage),
// auto-ships everything packed, runs payroll cycles. Capped at 2h.
export const OFFLINE_CAP_MS = 2 * 60 * 60 * 1000
export const OFFLINE_MIN_MS = 15_000

// Shop-scoped catch-up: runs parts delivery, lot delivery, pipeline processing,
// and auto-ship for a single shop-local slice of state. Returns the updated
// slice + a partial summary. Payroll is handled globally once, not per-shop.
function simulateShopOffline(shopSlice, globalCtx, ms) {
  const { now, channels } = globalCtx
  let s = shopSlice
  const summary = { sold: 0, earned: 0, grossEarned: 0, feesPaid: 0, partsArrived: 0, lotsArrived: 0, processedBy: {} }

  // 1. Parts landing
  const partsLanded = (s.partsIncoming || []).filter(o => o.arriveAt <= now)
  const partsKept   = (s.partsIncoming || []).filter(o => o.arriveAt > now)
  const partsQty    = partsLanded.reduce((n, o) => n + o.qty, 0)
  if (partsQty > 0) {
    summary.partsArrived = partsQty
    s = { ...s, parts: (s.parts || 0) + partsQty, partsIncoming: partsKept }
  }

  // 2. Lot landing
  const lotsLanded = (s.lotsIncoming || []).filter(o => o.arriveAt <= now)
  const lotsKept   = (s.lotsIncoming || []).filter(o => o.arriveAt > now)
  if (lotsLanded.length > 0) {
    const units = lotsLanded.flatMap(o => o.units || [])
    summary.lotsArrived = units.length
    s = {
      ...s,
      lotsIncoming: lotsKept,
      pipeline: { ...s.pipeline, incoming: [...(s.pipeline.incoming || []), ...units] },
    }
  }

  // 2b. Drip incoming → unchecked
  if ((s.pipeline?.incoming || []).length > 0) {
    s = {
      ...s,
      pipeline: {
        ...s.pipeline,
        incoming: [],
        unchecked: [...(s.pipeline.unchecked || []), ...s.pipeline.incoming],
      },
    }
  }

  // 2c. Idle Guard offline auto-parts: top up parts to cover expected tech
  // consumption over the offline window so the pipeline doesn't starve.
  if (s.facilities?.idleGuard) {
    const techLvl   = s.workers?.tech?.level || 1
    const techCount = (s.workers?.tech?.count || 0) + (s.workers?.desktopTech?.count || 0)
    if (techCount > 0) {
      const techDur    = Math.max(200, workerDuration(DURATIONS.repair, techLvl))
      const expected   = Math.floor((ms / techDur) * techCount)
      const incomingP  = (s.partsIncoming || []).reduce((n, o) => n + o.qty, 0)
      const onHand     = (s.parts || 0) + incomingP
      const deficit    = Math.max(0, expected - onHand)
      if (deficit > 0) {
        const ordersNeeded   = Math.ceil(deficit / 5)
        const ordersAfford   = Math.floor((globalCtx.rootMoney ?? 0) / 25)
        const orders         = Math.min(ordersNeeded, ordersAfford)
        if (orders > 0) {
          const cost = orders * 25
          s = { ...s, parts: (s.parts || 0) + orders * 5 }
          summary.partsArrived += orders * 5
          summary.autoPartsCost = (summary.autoPartsCost || 0) + cost
          globalCtx.rootMoney  = (globalCtx.rootMoney || 0) - cost
        }
      }
    }
  }

  // 3. Pipeline stages. Need a virtual state for research/speed lookups.
  const virt = { ...globalCtx.root, ...s }
  const speed = globalSpeedMult(virt)
  const stages = [
    { role: 'auditor', from: 'unchecked', to: 'audited',  dur: DURATIONS.audit },
    { role: 'tech',    from: 'audited',   to: 'repaired', dur: DURATIONS.repair },
    { role: 'imager',  from: 'repaired',  to: 'imaged',   dur: DURATIONS.image },
    { role: 'cleaner', from: 'imaged',    to: 'cleaned',  dur: DURATIONS.clean },
    { role: 'packer',  from: 'cleaned',   to: 'packed',   dur: DURATIONS.pack },
  ]
  for (const st of stages) {
    const w = s.workers?.[st.role] || { count: 0, level: 1 }
    if (!w.count) continue
    const dur = Math.max(200, workerDuration(st.dur, w.level) * researchRoleMult(virt, st.role) / (speed || 1))
    let capacity = Math.floor((ms / dur) * w.count)
    if (st.role === 'tech') {
      const dt = s.workers?.desktopTech?.count || 0
      if (dt > 0) capacity += Math.floor((ms / dur) * dt)
    }
    if (capacity <= 0) continue
    const queue = s.pipeline[st.from] || []
    let process = Math.min(capacity, queue.length)
    if (st.role === 'tech') process = Math.min(process, s.parts || 0)
    if (process <= 0) continue
    const moved = queue.slice(0, process)
    s = {
      ...s,
      pipeline: {
        ...s.pipeline,
        [st.from]: queue.slice(process),
        [st.to]: [...(s.pipeline[st.to] || []), ...moved],
      },
      parts: st.role === 'tech' ? (s.parts || 0) - process : s.parts,
    }
    summary.processedBy[st.role] = process
  }

  // 4. Auto-ship packed
  const packed = s.pipeline?.packed || []
  if (packed.length > 0) {
    const ch = channels.find(c => c.id === s.activeChannel) || channels[0]
    let totalGross = 0, totalFees = 0
    for (const u of packed) {
      const gross = Math.round(u.sellPrice * ch.sellMult)
      const fee   = Math.round(gross * ch.feePct)
      totalGross += gross
      totalFees  += fee
    }
    summary.sold = packed.length
    summary.earned = totalGross - totalFees
    summary.grossEarned = totalGross
    summary.feesPaid = totalFees
    s = { ...s, pipeline: { ...s.pipeline, packed: [] } }
  }

  return { slice: s, summary }
}

export function simulateOffline(state, elapsedMs) {
  if (!state || elapsedMs < OFFLINE_MIN_MS) return { state, summary: null }
  const ms = Math.min(elapsedMs, OFFLINE_CAP_MS)
  const now = Date.now()
  const summary = {
    ms, capped: elapsedMs > OFFLINE_CAP_MS,
    sold: 0, earned: 0, spent: 0,
    partsArrived: 0, lotsArrived: 0,
    payrolls: 0, payrollsMissed: 0,
    processedBy: {},
    shopCount: (state.shops || []).length || 1,
  }
  const globalCtx = { now, channels: CHANNELS, root: state, rootMoney: state.money || 0 }

  // Run catch-up for the active shop (state root slice)
  const activeSlice = extractShopState(state)
  const activeRun = simulateShopOffline(activeSlice, globalCtx, ms)
  let s = applyShopState(state, activeRun.slice)
  mergeSummaryInto(summary, activeRun.summary)

  // Run catch-up for each inactive shop (stored as snapshots in state.shops)
  let shops = s.shops || []
  if (shops.length > 1) {
    shops = shops.map(sh => {
      if (sh.id === s.activeShopId) return sh
      const run = simulateShopOffline(sh, globalCtx, ms)
      mergeSummaryInto(summary, run.summary)
      return { ...sh, ...run.slice, lastActiveAt: now }
    })
    s = { ...s, shops }
  }

  // Apply earnings (gross/fees/sold) + money, aggregated across all shops
  if (summary.sold > 0 || summary.earned !== 0) {
    s = {
      ...s,
      money: s.money + summary.earned,
      totalEarned: (s.totalEarned || 0) + summary.grossTotal,
      totalFees: (s.totalFees || 0) + summary.feesTotal,
      sold: (s.sold || 0) + summary.sold,
    }
  }

  // Deduct Idle Guard auto-parts spend
  if (summary.autoPartsCost) {
    s = { ...s, money: s.money - summary.autoPartsCost, totalSpent: (s.totalSpent || 0) + summary.autoPartsCost }
    summary.spent += summary.autoPartsCost
  }

  // 5. Payroll — cross-shop sum, paid once globally.
  // Default cap at 30 cycles (30 min) so walking away doesn't nuke the bank.
  // Idle Guard tightens to 10 cycles and enables no-work-no-pay: cycles when
  // pipeline was empty AND no lots incoming don't bill wages (crew idle).
  if (payrollUnlocked(s)) {
    const elapsedCycles = Math.floor(ms / 60_000)
    const hasGuard      = !!s.facilities?.idleGuard
    const hardCap       = hasGuard ? 10 : 30
    let cycles          = Math.min(elapsedCycles, hardCap)
    if (hasGuard) {
      // Estimate dead cycles: if this shop processed 0 units during offline
      // window and had no lots pending, bill only half the capped cycles.
      const anyWork = Object.values(summary.processedBy || {}).some(n => n > 0)
                   || (summary.lotsArrived || 0) > 0
      if (!anyWork) cycles = Math.max(1, Math.floor(cycles / 2))
    }
    summary.payrollCapped = cycles < elapsedCycles
    // AFK recovery floor: keep at least $20 in the bank after offline payroll
    // so returning to an empty shop doesn't instantly bankrupt you. The crew
    // eats some unpaid cycles rather than bleed the bankroll dry.
    const RECOVERY_FLOOR = 30
    const wagePerCycle   = totalWageAcrossShops(s)
    const maxAffordable  = wagePerCycle > 0 ? Math.max(0, Math.floor((s.money - RECOVERY_FLOOR) / wagePerCycle)) : cycles
    const floored        = Math.min(cycles, maxAffordable)
    if (floored < cycles) summary.payrollFloored = cycles - floored
    cycles = floored
    const due = wagePerCycle * cycles
    if (cycles > 0 && due > 0) {
      s = { ...s, money: s.money - due, totalSpent: s.totalSpent + due }
      summary.payrolls = cycles
      summary.spent += due
      s = bumpMorale(s, 3 * cycles)
    }
  }

  // 5b. Check milestones — offline catch-up may have crossed thresholds
  s = checkMilestones(s)

  // 6. Reset timers so live tickers don't double-run
  s = {
    ...s,
    lastActiveAt: now,
    lastPayrollAt: now,
    lastMoraleDecayAt: now,
    lastEventAt: now,
  }

  return { state: s, summary }
}

function mergeSummaryInto(agg, part) {
  agg.sold += part.sold || 0
  agg.earned += part.earned || 0
  agg.grossTotal = (agg.grossTotal || 0) + (part.grossEarned || 0)
  agg.feesTotal  = (agg.feesTotal  || 0) + (part.feesPaid    || 0)
  agg.partsArrived += part.partsArrived || 0
  agg.lotsArrived += part.lotsArrived || 0
  for (const [role, n] of Object.entries(part.processedBy || {})) {
    agg.processedBy[role] = (agg.processedBy[role] || 0) + n
  }
}

export const DECISION_EVENTS = [
  {
    id: 'sketchy_pallet',
    icon: '🕶️',
    title: 'Sketchy Salesman',
    body: 'A guy in a trench coat waves you over. "Flat fee for a pallet. Sight unseen. Cash only, no questions."',
    condition: s => s.sold >= 3,
    options: [
      { label: s => { const c = bankrollHit(s, 0.06, 150, 3000); return `Take the deal ($${c})` }, apply: s => {
        const cost = bankrollHit(s, 0.06, 150, 3000)
        if (s.money < cost) return mkLog(s, 'log.sketchy.shortCash', { cost })
        const after = mkLog({ ...s, money: s.money - cost, totalSpent: s.totalSpent + cost }, 'log.sketchy.handOver', { cost })
        const r = Math.random()
        if (r < 0.45) return mkLog(seedUnits(after, 5, 'fair'), 'log.sketchy.resultFair')
        if (r < 0.80) return mkLog(seedUnits(after, 5, 'bad'),  'log.sketchy.resultBad')
        if (r < 0.95) return mkLog(seedUnits(after, 5, 'good'), 'log.sketchy.resultGood')
        return mkLog(after, 'log.sketchy.cops', { cost })
      }},
      { label: 'Walk away', apply: s => mkLog(s, 'log.sketchy.walkAway') },
    ],
  },
  {
    id: 'irs_audit',
    icon: '🏛️',
    title: 'IRS Audit',
    body: 'A letter from the IRS. They want to "discuss" your books. You can settle now or roll the dice in court.',
    // Warehouse+ only — IRS doesn't come after garage operators. Prevents the
    // $800-min penalty from one-shotting a $100 starter.
    condition: s => s.sold >= 120,
    options: [
      { label: s => `Settle — $${bankrollHit(s, 0.08, 400, 8000).toLocaleString()}`, apply: s => {
        const cost = bankrollHit(s, 0.08, 400, 8000)
        if (s.money < cost) return mkLog(s, 'log.irs.lien', { cost: cost.toLocaleString() })
        return mkLog({ ...s, money: s.money - cost, totalSpent: s.totalSpent + cost }, 'log.irs.settled', { cost: cost.toLocaleString() })
      }},
      { label: 'Fight it in court', apply: s => {
        if (Math.random() < 0.5) return mkLog(s, 'log.irs.won')
        const fine = bankrollHit(s, 0.20, 1000, 20000)
        return mkLog({ ...s, money: s.money - fine, totalSpent: s.totalSpent + fine }, 'log.irs.lost', { fine: fine.toLocaleString() })
      }},
    ],
  },
  {
    id: 'local_news',
    icon: '📺',
    title: 'Local News Interview',
    body: 'Channel 5 wants to feature your shop in their "Local Business Spotlight" segment. They need a "production fee" up front.',
    condition: s => s.sold >= 15,
    options: [
      { label: s => `Do the interview ($${bankrollHit(s, 0.04, 200, 2500).toLocaleString()})`, apply: s => {
        const fee = bankrollHit(s, 0.04, 200, 2500)
        if (s.money < fee) return mkLog(s, 'log.localNews.broke', { fee: fee.toLocaleString() })
        const after = { ...s, money: s.money - fee, totalSpent: s.totalSpent + fee }
        if (Math.random() < 0.6) {
          const payoff = bankrollHit(s, 0.18, 800, 12000)
          return mkLog({ ...after, money: after.money + payoff, totalEarned: s.totalEarned + payoff }, 'log.localNews.viral', { payoff: payoff.toLocaleString() })
        }
        return mkLog(after, 'log.localNews.flop', { fee: fee.toLocaleString() })
      }},
      { label: 'Not interested', apply: s => mkLog(s, 'log.localNews.decline') },
    ],
  },
  {
    id: 'tech_school',
    icon: '🎓',
    title: 'Tech School Intern',
    body: 'A tech school kid asks for unpaid hours. "Free labor, I just need the experience." Sounds too good?',
    condition: s => s.sold >= 10 && s.pipeline.audited.length >= 1,
    options: [
      { label: 'Accept free labor', apply: s => {
        if (Math.random() < 0.70) return skipAheadRepairs(s, 3)
        return mkLog(scrapAudited(s, 1), 'log.techSchool.smoked')
      }},
      { label: 'No thanks', apply: s => mkLog(s, 'log.techSchool.declined') },
    ],
  },
  {
    id: 'dumpster',
    icon: '🗑️',
    title: 'Alley Find',
    body: 'Office closed down the block. There\'s a pile of old hardware in the dumpster. Free, but…sketchy.',
    condition: s => s.sold >= 5,
    options: [
      { label: 'Grab it (free)', apply: s => mkLog(seedUnits(s, 3, 'bad'), 'log.dumpster.haul') },
      { label: 'Pass', apply: s => mkLog(s, 'log.dumpster.pass') },
    ],
  },
  {
    id: 'angry_customer',
    icon: '😡',
    title: 'Angry Customer',
    body: 'A buyer is screaming on the phone. Their unit "died in a week." They want a refund or they\'ll trash you online.',
    condition: s => s.sold >= 20,
    options: [
      { label: s => `Refund — $${bankrollHit(s, 0.025, 100, 1500).toLocaleString()}`, apply: s => {
        const refund = bankrollHit(s, 0.025, 100, 1500)
        if (s.money < refund) return mkLog(s, 'log.angry.cantRefund', { refund: refund.toLocaleString() })
        return mkLog({ ...s, money: s.money - refund }, 'log.angry.refunded', { refund: refund.toLocaleString() })
      }},
      { label: 'Tell them to pound sand', apply: s => {
        if (Math.random() < 0.5) return mkLog(s, 'log.angry.gaveUp')
        const loss = bankrollHit(s, 0.07, 300, 4000)
        return mkLog({ ...s, money: Math.max(0, s.money - loss) }, 'log.angry.reviewsTanked', { loss: loss.toLocaleString() })
      }},
    ],
  },
  {
    id: 'verified_seller',
    icon: '🏅',
    title: 'Verified Amazon Seller',
    body: 'Amazon offers a "Verified Seller" badge for $500. Boosts trust — and your prices.',
    condition: s => s.money >= 500 && s.sold >= 50 && !s.bonuses?.amazonBoost,
    options: [
      { label: 'Buy the badge — $500', apply: s => mkLog({
        ...s,
        money: s.money - 500,
        totalSpent: s.totalSpent + 500,
        bonuses: { ...s.bonuses, amazonBoost: true },
      }, 'log.verified.bought') },
      { label: 'Skip it', apply: s => mkLog(s, 'log.verified.skipped') },
    ],
  },
  {
    id: 'craigslist',
    icon: '📋',
    title: 'Craigslist Haul',
    body: '"Moving out, 8 old laptops, cash only, no tire kickers."',
    condition: s => s.sold >= 10,
    options: [
      { label: s => `Go get them ($${bankrollHit(s, 0.07, 250, 2500).toLocaleString()})`, apply: s => {
        const cost = bankrollHit(s, 0.07, 250, 2500)
        if (s.money < cost) return mkLog(s, 'log.craigslist.broke', { cost: cost.toLocaleString() })
        const after = { ...s, money: s.money - cost, totalSpent: s.totalSpent + cost }
        const r = Math.random()
        if (r < 0.4) return mkLog(seedUnits(after, 8, 'fair'), 'log.craigslist.fair')
        if (r < 0.8) return mkLog(seedUnits(after, 8, 'bad'),  'log.craigslist.bad')
        return mkLog(seedUnits(after, 8, 'good'), 'log.craigslist.good')
      }},
      { label: 'Keep scrolling', apply: s => mkLog(s, 'log.craigslist.skip') },
    ],
  },

  // ── Lasting-consequence events (buffs/debuffs) ────────────────────────────
  {
    id: 'power_outage',
    icon: '⚡',
    title: 'Power Outage',
    body: 'Transformer blew down the street. Whole block is dark. Your options:',
    condition: s => s.sold >= 10,
    options: [
      { label: 'Ride it out (-50% speed, 2 min)', apply: s => withBuff(mkLog(s, 'log.power.rideOut'), { id: 'power_out', icon: '🕯️', label: '-50% Speed', durationMs: 120_000, effect: { type: 'speed', mult: 0.5 } }) },
      { label: 'Rent a generator', apply: s => {
        const cost = bankrollHit(s, 0.08, 150, 600)
        if (s.money < cost) return mkLog(s, 'log.power.noGenerator', { cost })
        return mkLog({ ...s, money: s.money - cost, totalSpent: s.totalSpent + cost }, 'log.power.rented', { cost })
      }},
      { label: 'Send crew home (free)', apply: s => withBuff(mkLog(s, 'log.power.sentHome'), { id: 'power_out', icon: '🏠', label: '-70% Speed', durationMs: 90_000, effect: { type: 'speed', mult: 0.3 } }) },
    ],
  },
  {
    id: 'bad_review',
    icon: '⭐',
    title: '1-Star Review',
    body: 'Some guy left a scathing 1-star review. "Battery died in 3 days, scammers!" It\'s trending on the subreddit.',
    condition: s => s.sold >= 15,
    options: [
      { label: 'Pay to bury it', apply: s => {
        const cost = bankrollHit(s, 0.05, 100, 400)
        if (s.money < cost) return mkLog(withBuff(s, { id: 'bad_reviews', icon: '👎', label: '-15% Sales', durationMs: 180_000, effect: { type: 'sell', mult: 0.85 } }), 'log.badReview.noSeo', { cost })
        return mkLog({ ...s, money: s.money - cost, totalSpent: s.totalSpent + cost }, 'log.badReview.buried', { cost })
      }},
      { label: 'Respond publicly', apply: s => {
        if (Math.random() < 0.4) return withBuff(mkLog(s, 'log.badReview.wittyReply'), { id: 'viral_reply', icon: '🎤', label: '+15% Sales', durationMs: 180_000, effect: { type: 'sell', mult: 1.15 } })
        return withBuff(mkLog(s, 'log.badReview.worseReply'), { id: 'bad_reviews', icon: '👎', label: '-15% Sales', durationMs: 180_000, effect: { type: 'sell', mult: 0.85 } })
      }},
      { label: 'Ignore it', apply: s => withBuff(mkLog(s, 'log.badReview.ignored'), { id: 'bad_reviews', icon: '👎', label: '-10% Sales', durationMs: 120_000, effect: { type: 'sell', mult: 0.90 } }) },
    ],
  },
  {
    id: 'coffee_run',
    icon: '☕',
    title: 'Coffee Run',
    body: 'Morale is low. A team coffee run might perk everyone up.',
    condition: s => s.sold >= 5 && s.money >= 40,
    options: [
      { label: 'Espresso for everyone ($60)', apply: s => {
        if (s.money < 60) return mkLog(s, 'log.coffee.brokeGood')
        return bumpMorale(withBuff(mkLog({ ...s, money: s.money - 60, totalSpent: s.totalSpent + 60 }, 'log.coffee.espresso'), { id: 'caffeine', icon: '☕', label: '+20% Speed', durationMs: 120_000, effect: { type: 'speed', mult: 1.2 } }), 10)
      }},
      { label: 'Gas station coffee ($20)', apply: s => {
        if (s.money < 20) return mkLog(s, 'log.coffee.brokeCheap')
        return bumpMorale(withBuff(mkLog({ ...s, money: s.money - 20, totalSpent: s.totalSpent + 20 }, 'log.coffee.cheap'), { id: 'caffeine', icon: '☕', label: '+10% Speed', durationMs: 90_000, effect: { type: 'speed', mult: 1.1 } }), 4)
      }},
      { label: 'Skip it', apply: s => bumpMorale(mkLog(s, 'log.coffee.skip'), -3) },
    ],
  },
  {
    id: 'permit_inspector',
    icon: '📋',
    title: 'Permit Inspector',
    body: 'A city inspector knocks. "Your fire exit signs are out of date." They want to see paperwork.',
    condition: s => s.sold >= 20,
    options: [
      { label: 'Pay the fine', apply: s => {
        const fine = bankrollHit(s, 0.06, 200, 800)
        if (s.money < fine) return mkLog(withBuff(s, { id: 'shutdown', icon: '🚫', label: '-40% Speed', durationMs: 180_000, effect: { type: 'speed', mult: 0.6 } }), 'log.inspector.shutdown', { fine })
        return mkLog({ ...s, money: s.money - fine, totalSpent: s.totalSpent + fine }, 'log.inspector.paid', { fine })
      }},
      { label: 'Bribe him', apply: s => {
        const bribe = bankrollHit(s, 0.03, 80, 300)
        if (s.money < bribe) return mkLog(s, 'log.inspector.noBribe', { bribe })
        if (Math.random() < 0.7) return mkLog({ ...s, money: s.money - bribe, totalSpent: s.totalSpent + bribe }, 'log.inspector.tipped', { bribe })
        const fine = bankrollHit(s, 0.10, 400, 1500)
        return mkLog({ ...s, money: s.money - fine, totalSpent: s.totalSpent + fine }, 'log.inspector.wrongOne', { fine })
      }},
      { label: 'Play dumb', apply: s => {
        if (Math.random() < 0.4) return mkLog(s, 'log.inspector.gaveUp')
        return withBuff(mkLog(s, 'log.inspector.followups'), { id: 'inspector_heat', icon: '📋', label: '-10% Speed', durationMs: 150_000, effect: { type: 'speed', mult: 0.9 } })
      }},
    ],
  },
  {
    id: 'viral_tiktok',
    icon: '📱',
    title: 'Viral TikTok',
    body: 'Someone made a TikTok unboxing one of your refurbs. 2M views. Orders incoming.',
    condition: s => s.sold >= 30,
    options: [
      { label: 'Ride the wave', apply: s => withBuff(mkLog(s, 'log.tiktok.ride'), { id: 'tiktok_viral', icon: '📱', label: '+25% Sales', durationMs: 240_000, effect: { type: 'sell', mult: 1.25 } }) },
      { label: 'Thank the creator (-$200 gift)', apply: s => {
        if (s.money < 200) return mkLog(s, 'log.tiktok.cantThank')
        return withBuff(mkLog({ ...s, money: s.money - 200, totalSpent: s.totalSpent + 200 }, 'log.tiktok.thanked'), { id: 'tiktok_viral', icon: '📱', label: '+40% Sales', durationMs: 240_000, effect: { type: 'sell', mult: 1.40 } })
      }},
    ],
  },
  {
    id: 'lawsuit',
    icon: '⚖️',
    title: 'Lawsuit Threat',
    body: 'A customer\'s lawyer sent a letter. "My client\'s data was on the drive you sold." 😬',
    condition: s => s.money >= 600 && s.sold >= 40,
    options: [
      { label: 'Settle quietly', apply: s => {
        const cost = bankrollHit(s, 0.10, 600, 3000)
        return mkLog({ ...s, money: s.money - cost, totalSpent: s.totalSpent + cost }, 'log.lawsuit.settled', { cost })
      }},
      { label: 'Hire a lawyer', apply: s => {
        const retainer = bankrollHit(s, 0.04, 300, 1500)
        if (s.money < retainer) return mkLog(s, 'log.lawsuit.noRetainer', { retainer })
        const after = { ...s, money: s.money - retainer, totalSpent: s.totalSpent + retainer }
        if (Math.random() < 0.7) return mkLog(after, 'log.lawsuit.won', { retainer })
        const loss = bankrollHit(s, 0.20, 1500, 8000)
        return mkLog({ ...after, money: after.money - loss, totalSpent: after.totalSpent + loss }, 'log.lawsuit.lost', { loss, retainer })
      }},
      { label: 'Ignore it', apply: s => withBuff(mkLog(s, 'log.lawsuit.ignored'), { id: 'legal_cloud', icon: '⚖️', label: '-20% Sales', durationMs: 300_000, effect: { type: 'sell', mult: 0.80 } }) },
    ],
  },
  {
    id: 'bulk_offer',
    icon: '🏷️',
    title: 'Bulk Buyer Walk-In',
    body: 'A reseller wants every packed unit you have, sight unseen. Quick cash, but he\'s paying below market.',
    condition: s => s.pipeline.packed.length >= 5,
    options: [
      { label: s => {
          const packed = s.pipeline.packed
          const avgSell = Math.round(packed.reduce((sum, u) => sum + (u.sellPrice || 0), 0) / Math.max(1, packed.length))
          const perUnit = Math.max(40, Math.round(avgSell * 0.70))
          return `Take the offer — $${perUnit}/unit`
        }, apply: s => {
        const packed = s.pipeline.packed
        const n = packed.length
        const avgSell = Math.round(packed.reduce((sum, u) => sum + (u.sellPrice || 0), 0) / Math.max(1, n))
        const perUnit = Math.max(40, Math.round(avgSell * 0.70))
        const gross = n * perUnit
        return mkLog({
          ...s,
          money: s.money + gross,
          totalEarned: s.totalEarned + gross,
          sold: s.sold + n,
          pipeline: { ...s.pipeline, packed: [] },
        }, 'log.bulk.sold', { n, perUnit, gross: gross.toLocaleString() })
      }},
      { label: s => {
          const packed = s.pipeline.packed
          const avgSell = Math.round(packed.reduce((sum, u) => sum + (u.sellPrice || 0), 0) / Math.max(1, packed.length))
          const perUnit = Math.max(60, Math.round(avgSell * 0.95))
          return `Counter — $${perUnit}/unit (he might walk)`
        }, apply: s => {
        const packed = s.pipeline.packed
        const n = packed.length
        const avgSell = Math.round(packed.reduce((sum, u) => sum + (u.sellPrice || 0), 0) / Math.max(1, n))
        const perUnit = Math.max(60, Math.round(avgSell * 0.95))
        if (Math.random() < 0.5) {
          const gross = n * perUnit
          return mkLog({ ...s, money: s.money + gross, totalEarned: s.totalEarned + gross, sold: s.sold + n, pipeline: { ...s.pipeline, packed: [] } }, 'log.bulk.counterAccepted', { n, perUnit, gross: gross.toLocaleString() })
        }
        return mkLog(s, 'log.bulk.walked')
      }},
      { label: 'Pass', apply: s => mkLog(s, 'log.bulk.pass') },
    ],
  },
  {
    id: 'crew_party',
    icon: '🎉',
    title: 'Crew Morale',
    body: 'The team has been grinding. Throw them a party?',
    condition: s => s.sold >= 25 && Object.values(s.workers).filter(w => (w.count || 0) > 0).length >= 3,
    options: [
      { label: 'Big pizza party ($250)', apply: s => {
        if (s.money < 250) return mkLog(s, 'log.party.brokeBig')
        return bumpMorale(withBuff(mkLog({ ...s, money: s.money - 250, totalSpent: s.totalSpent + 250 }, 'log.party.big'), { id: 'morale_high', icon: '🚀', label: '+25% Speed', durationMs: 180_000, effect: { type: 'speed', mult: 1.25 } }), 20)
      }},
      { label: 'Cheap pizza ($80)', apply: s => {
        if (s.money < 80) return mkLog(s, 'log.party.brokeCheap')
        return bumpMorale(withBuff(mkLog({ ...s, money: s.money - 80, totalSpent: s.totalSpent + 80 }, 'log.party.cheap'), { id: 'morale_high', icon: '⬆', label: '+10% Speed', durationMs: 120_000, effect: { type: 'speed', mult: 1.1 } }), 8)
      }},
      { label: 'Skip', apply: s => bumpMorale(withBuff(mkLog(s, 'log.party.skip'), { id: 'morale_low', icon: '😐', label: '-10% Speed', durationMs: 90_000, effect: { type: 'speed', mult: 0.9 } }), -10) },
    ],
  },

  // ── Risk/reward gambles ──────────────────────────────────────────────────
  {
    id: 'estate_sale',
    icon: '🏚️',
    title: 'Estate Sale',
    body: 'Old collector died. Family wants the whole stash gone — 10 laptops, take them all or nothing.',
    condition: s => s.sold >= 20,
    options: [
      { label: s => { const c = bankrollHit(s, 0.09, 400, 3500); return `Buy the stash ($${c.toLocaleString()})` }, apply: s => {
        const cost = bankrollHit(s, 0.09, 400, 3500)
        if (s.money < cost) return mkLog(s, 'log.estate.broke', { cost: cost.toLocaleString() })
        const after = { ...s, money: s.money - cost, totalSpent: s.totalSpent + cost }
        const r = Math.random()
        if (r < 0.15) return mkLog(seedUnits(after, 10, 'good'), 'log.estate.pristine')
        if (r < 0.55) return mkLog(seedUnits(after, 10, 'fair'), 'log.estate.decent')
        return mkLog(seedUnits(after, 10, 'bad'), 'log.estate.junk')
      }},
      { label: 'Pass', apply: s => mkLog(s, 'log.estate.pass') },
    ],
  },
  {
    id: 'midnight_buyer',
    icon: '🌙',
    title: 'Midnight Buyer',
    body: 'A guy in a black SUV offers 2× market rate for every packed unit you have. Cash. "No receipts." (Off the books — no contract credit.)',
    condition: s => s.pipeline.packed.length >= 8 && s.sold >= 40,
    options: [
      { label: s => {
          const packed = s.pipeline.packed
          const avgSell = Math.round(packed.reduce((sum, u) => sum + (u.sellPrice || 0), 0) / Math.max(1, packed.length))
          const perUnit = Math.round(avgSell * 2)
          return `Take the cash ($${perUnit}/unit)`
        }, apply: s => {
        const packed = s.pipeline.packed
        const n = packed.length
        const avgSell = Math.round(packed.reduce((sum, u) => sum + (u.sellPrice || 0), 0) / Math.max(1, n))
        const perUnit = Math.round(avgSell * 2)
        const gross = n * perUnit
        const after = mkLog({
          ...s,
          money: s.money + gross,
          totalEarned: s.totalEarned + gross,
          sold: s.sold + n,
          pipeline: { ...s.pipeline, packed: [] },
        }, 'log.midnight.cash', { n, gross: gross.toLocaleString() })
        // 35% chance IRS comes knocking later
        if (Math.random() < 0.35) {
          const fine = bankrollHit(s, 0.12, 800, 10000)
          return mkLog({ ...after, money: Math.max(0, after.money - fine), totalSpent: after.totalSpent + fine }, 'log.midnight.irsLater', { fine: fine.toLocaleString() })
        }
        return after
      }},
      { label: 'Refuse (too shady)', apply: s => mkLog(s, 'log.midnight.refuse') },
    ],
  },
  {
    id: 'lucky_find',
    icon: '🍀',
    title: 'Lucky Find',
    body: 'Found an unopened box of laptops in a storage unit you bought at auction last year. Totally forgot about them.',
    condition: s => s.sold >= 30,
    options: [
      { label: 'Keep them all', apply: s => {
        const r = Math.random()
        if (r < 0.5) return mkLog(seedUnits(s, 3, 'fair'), 'log.luckyFind.fair')
        if (r < 0.85) return mkLog(seedUnits(s, 3, 'good'), 'log.luckyFind.good')
        return mkLog(seedUnits(s, 5, 'good'), 'log.luckyFind.jackpot')
      }},
      { label: 'Donate to the school (+rep)', apply: s => withBuff(mkLog(s, 'log.luckyFind.donated'), { id: 'good_rep', icon: '🌟', label: '+10% Sales', durationMs: 240_000, effect: { type: 'sell', mult: 1.10 } }) },
    ],
  },

  // ── Loss mitigation ──────────────────────────────────────────────────────
  {
    id: 'rent_hike',
    icon: '🏠',
    title: 'Rent Hike',
    body: 'Landlord wants 30% more starting next month. "Market rate," he says. Smells like bluff.',
    condition: s => s.sold >= 50,
    options: [
      { label: s => `Pay up — $${bankrollHit(s, 0.05, 300, 2500).toLocaleString()}`, apply: s => {
        const cost = bankrollHit(s, 0.05, 300, 2500)
        if (s.money < cost) return mkLog(withBuff(s, { id: 'rent_squeeze', icon: '🏠', label: '-15% Speed', durationMs: 300_000, effect: { type: 'speed', mult: 0.85 } }), 'log.rent.eviction', { cost: cost.toLocaleString() })
        return mkLog({ ...s, money: s.money - cost, totalSpent: s.totalSpent + cost }, 'log.rent.paid', { cost: cost.toLocaleString() })
      }},
      { label: 'Negotiate hard', apply: s => {
        if (Math.random() < 0.55) return mkLog(s, 'log.rent.caved')
        const cost = bankrollHit(s, 0.08, 500, 3500)
        if (s.money < cost) return withBuff(mkLog(s, 'log.rent.dugInBroke', { cost: cost.toLocaleString() }), { id: 'rent_squeeze', icon: '🏠', label: '-20% Speed', durationMs: 300_000, effect: { type: 'speed', mult: 0.80 } })
        return mkLog({ ...s, money: s.money - cost, totalSpent: s.totalSpent + cost }, 'log.rent.dugInPaid', { cost: cost.toLocaleString() })
      }},
    ],
  },
  {
    id: 'pipe_burst',
    icon: '💧',
    title: 'Pipe Burst',
    body: 'Water main blew in the back room. Moving fast prevents damage.',
    condition: s => s.sold >= 25,
    options: [
      { label: s => `Emergency plumber — $${bankrollHit(s, 0.04, 250, 1500).toLocaleString()}`, apply: s => {
        const cost = bankrollHit(s, 0.04, 250, 1500)
        if (s.money < cost) return withBuff(mkLog(s, 'log.pipe.broke', { cost: cost.toLocaleString() }), { id: 'flood', icon: '💧', label: '-35% Speed', durationMs: 240_000, effect: { type: 'speed', mult: 0.65 } })
        return mkLog({ ...s, money: s.money - cost, totalSpent: s.totalSpent + cost }, 'log.pipe.fixed', { cost: cost.toLocaleString() })
      }},
      { label: 'DIY fix', apply: s => {
        if (Math.random() < 0.45) return mkLog(s, 'log.pipe.diyWorked')
        return withBuff(mkLog(s, 'log.pipe.diyFailed'), { id: 'flood', icon: '💧', label: '-25% Speed', durationMs: 180_000, effect: { type: 'speed', mult: 0.75 } })
      }},
      { label: 'Let it soak', apply: s => withBuff(mkLog(s, 'log.pipe.ignored'), { id: 'flood', icon: '💧', label: '-40% Speed', durationMs: 300_000, effect: { type: 'speed', mult: 0.60 } }) },
    ],
  },
  {
    id: 'ransomware',
    icon: '🔒',
    title: 'Ransomware Hit',
    body: 'Your inventory spreadsheet is encrypted. A pop-up demands crypto to unlock it.',
    condition: s => s.sold >= 60,
    options: [
      { label: s => `Pay ransom — $${bankrollHit(s, 0.07, 400, 4000).toLocaleString()}`, apply: s => {
        const cost = bankrollHit(s, 0.07, 400, 4000)
        if (s.money < cost) return mkLog(withBuff(s, { id: 'data_lost', icon: '💾', label: '-20% Speed', durationMs: 300_000, effect: { type: 'speed', mult: 0.80 } }), 'log.ransom.cantPay')
        if (Math.random() < 0.75) return mkLog({ ...s, money: s.money - cost, totalSpent: s.totalSpent + cost }, 'log.ransom.restored', { cost: cost.toLocaleString() })
        return mkLog({ ...s, money: s.money - cost, totalSpent: s.totalSpent + cost }, 'log.ransom.ghosted', { cost: cost.toLocaleString() })
      }},
      { label: s => `Hire IT pro — $${bankrollHit(s, 0.05, 300, 2000).toLocaleString()}`, apply: s => {
        const cost = bankrollHit(s, 0.05, 300, 2000)
        if (s.money < cost) return mkLog(s, 'log.ransom.noIt')
        if (Math.random() < 0.65) return mkLog({ ...s, money: s.money - cost, totalSpent: s.totalSpent + cost }, 'log.ransom.itWon', { cost: cost.toLocaleString() })
        return withBuff(mkLog({ ...s, money: s.money - cost, totalSpent: s.totalSpent + cost }, 'log.ransom.itFailed', { cost: cost.toLocaleString() }), { id: 'data_lost', icon: '💾', label: '-15% Speed', durationMs: 240_000, effect: { type: 'speed', mult: 0.85 } })
      }},
      { label: 'Rebuild from scratch', apply: s => withBuff(mkLog(s, 'log.ransom.rebuild'), { id: 'data_lost', icon: '💾', label: '-10% Speed', durationMs: 180_000, effect: { type: 'speed', mult: 0.90 } }) },
    ],
  },

  // ── Flavor / trades ──────────────────────────────────────────────────────
  {
    id: 'radio_spot',
    icon: '📻',
    title: 'Local Radio Spot',
    body: 'AM station offers an ad slot. Reaches mostly boomers — good for laptop buyers.',
    condition: s => s.sold >= 20,
    options: [
      { label: s => `Book prime-time — $${bankrollHit(s, 0.05, 300, 1800).toLocaleString()}`, apply: s => {
        const cost = bankrollHit(s, 0.05, 300, 1800)
        if (s.money < cost) return mkLog(s, 'log.radio.broke', { cost: cost.toLocaleString() })
        return withBuff(mkLog({ ...s, money: s.money - cost, totalSpent: s.totalSpent + cost }, 'log.radio.booked'), { id: 'radio_ad', icon: '📻', label: '+15% Sales', durationMs: 300_000, effect: { type: 'sell', mult: 1.15 } })
      }},
      { label: s => `Cheap 3am slot — $${bankrollHit(s, 0.015, 80, 500).toLocaleString()}`, apply: s => {
        const cost = bankrollHit(s, 0.015, 80, 500)
        if (s.money < cost) return mkLog(s, 'log.radio.broke', { cost: cost.toLocaleString() })
        return withBuff(mkLog({ ...s, money: s.money - cost, totalSpent: s.totalSpent + cost }, 'log.radio.graveyard'), { id: 'radio_ad', icon: '📻', label: '+5% Sales', durationMs: 180_000, effect: { type: 'sell', mult: 1.05 } })
      }},
      { label: 'Skip', apply: s => mkLog(s, 'log.radio.skip') },
    ],
  },
  {
    id: 'rival_shop',
    icon: '🏪',
    title: 'Rival Shop Opens',
    body: 'A new refurbisher opened across town. Flashy signs, aggressive prices.',
    condition: s => s.sold >= 40,
    options: [
      { label: 'Undercut them hard', apply: s => {
        const r = Math.random()
        if (r < 0.6) return withBuff(mkLog(s, 'log.rival.warWinning'), { id: 'price_war', icon: '⚔️', label: '+20% Sales / -10% Sell', durationMs: 300_000, effect: { type: 'sell', mult: 1.10 } })
        return withBuff(mkLog(s, 'log.rival.warStressed'), { id: 'price_war_bad', icon: '⚔️', label: '-15% Speed', durationMs: 240_000, effect: { type: 'speed', mult: 0.85 } })
      }},
      { label: 'Double down on quality', apply: s => withBuff(mkLog(s, 'log.rival.premium'), { id: 'premium_rep', icon: '✨', label: '+12% Sell', durationMs: 300_000, effect: { type: 'sell', mult: 1.12 } }) },
      { label: 'Ignore them', apply: s => {
        if (Math.random() < 0.5) return mkLog(s, 'log.rival.flamedOut')
        return withBuff(mkLog(s, 'log.rival.eatingLunch'), { id: 'market_share', icon: '📉', label: '-12% Sales', durationMs: 240_000, effect: { type: 'sell', mult: 0.88 } })
      }},
    ],
  },
]

// Pick an eligible random event (returns null if none)
export function pickDecisionEvent(state) {
  const eligible = DECISION_EVENTS.filter(ev => ev.condition(state))
  if (!eligible.length) return null
  return eligible[Math.floor(Math.random() * eligible.length)]
}

// ── B2B Contracts ────────────────────────────────────────────────────────────

// Quantities bumped 2026-04-20 from playtest feedback: company-tier contracts
// were trivial (10–30 units done in a minute). Aimed at "hundreds of computers"
// feel — company tier now 30–80 units, deposits and rewards scaled ~3×.
export const CONTRACT_TEMPLATES = [
  { id: 'starter_laptops',   icon: '📋', label: 'Starter Order',     required: { laptop: 30 },                      durationMs: 240_000, deposit: 600,   reward: 2800,   unlockStage: 'company'  },
  { id: 'tablet_rush',       icon: '📱', label: 'Tablet Rush',       required: { tablet: 45 },                      durationMs: 300_000, deposit: 1500,  reward: 7000,   unlockStage: 'company'  },
  { id: 'corp_refresh',      icon: '🏢', label: 'Corp Refresh',      required: { desktop: 60, laptop: 30 },         durationMs: 360_000, deposit: 3000,  reward: 16000,  unlockStage: 'company'  },
  { id: 'apple_premium',     icon: '🍎', label: 'Apple Premium',     required: { apple: 20 },                       durationMs: 300_000, deposit: 4500,  reward: 22000,  unlockStage: 'regional' },
  { id: 'phone_bulk',        icon: '📞', label: 'Phone Bulk',        required: { phone: 120 },                      durationMs: 360_000, deposit: 3600,  reward: 19000,  unlockStage: 'regional' },
  { id: 'school_district',   icon: '🎓', label: 'School District',   required: { desktop: 90, monitor: 60 },        durationMs: 540_000, deposit: 9000,  reward: 48000,  unlockStage: 'corporate' },
  { id: 'office_buildout',   icon: '🏭', label: 'Office Buildout',   required: { aio: 75, monitor: 75 },            durationMs: 480_000, deposit: 12000, reward: 62000,  unlockStage: 'corporate' },
  { id: 'gov_mega',          icon: '🏛️', label: 'Gov Mega Deal',    required: { laptop: 300, tablet: 150, phone: 150 }, durationMs: 1080_000, deposit: 30000, reward: 180000, unlockStage: 'corporate' },
]

// Scale a contract template to match the player's current stage + headcount.
// Mult = (1.8 ^ overshoot stages past unlockStage) * (1 + 0.05 * total hires)
// Reward keeps a small edge over qty-scaling so bigger contracts still feel worth it.
export function scaledContract(tpl, state) {
  const stageIdx  = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
  const tplIdx    = EXPANSION_STAGES.findIndex(s => s.id === tpl.unlockStage)
  const overshoot = Math.max(0, stageIdx - tplIdx)
  const qtyMult   = Math.pow(1.8, overshoot)
  const hires     = totalHires(state)
  const headMult  = 1 + (hires * 0.05)
  const mult      = qtyMult * headMult
  const earnFloor = Math.round((state.totalEarned || 0) / 120)  // reward is at least 1/120th of lifetime earnings
  // Reward premium grows with overshoot: base 1.12×, 1.25× at +1 stage, 1.40× at +2, 1.55× at +3
  const rewardPremium = 1.12 + Math.min(overshoot, 3) * 0.14
  return {
    required: Object.fromEntries(Object.entries(tpl.required).map(([k, v]) => [k, Math.ceil(v * mult)])),
    reward:   Math.max(earnFloor, Math.round(tpl.reward  * mult * rewardPremium)),
    deposit:  Math.round(tpl.deposit * mult),
    mult,
  }
}

export function contractUnlocked(c, state) {
  const curIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
  const reqIdx = EXPANSION_STAGES.findIndex(s => s.id === c.unlockStage)
  if (curIdx < reqIdx) return false
  if (!state.specials?.sales?.hired) return false
  return contractFulfillable(c, state)
}

// Every required device type must be unlocked at the player's current stage
export function contractFulfillable(c, state) {
  const curIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
  for (const typeId of Object.keys(c.required)) {
    const t = DEVICE_TYPES.find(d => d.id === typeId)
    if (!t) return false
    const needIdx = EXPANSION_STAGES.findIndex(s => s.id === t.unlockStage)
    if (curIdx < needIdx) return false
  }
  return true
}

export function contractsFeatureVisible(state) {
  const curIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
  const minIdx = EXPANSION_STAGES.findIndex(s => s.id === 'company')
  return curIdx >= minIdx
}

// Progress map { type: { have, need } } for the active contract.
// Uses the ac's snapshotted required (scaled at accept time) — falls back to template for legacy saves.
export function contractProgress(state, contract) {
  const ac = contract || state.activeContract
  if (!ac) return null
  const tpl = CONTRACT_TEMPLATES.find(c => c.id === ac.id)
  if (!tpl) return null
  const req = ac.required || tpl.required
  const cur = state.counters?.typeSoldCount || {}
  const start = ac.startingCounts || {}
  const progress = {}
  for (const [type, need] of Object.entries(req)) {
    const have = Math.max(0, (cur[type] || 0) - (start[type] || 0))
    progress[type] = { have: Math.min(have, need), need, done: have >= need }
  }
  return progress
}

export function contractAllMet(state, contract) {
  const p = contractProgress(state, contract)
  if (!p) return false
  return Object.values(p).every(x => x.done)
}

export function contractTimeLeft(state, contractOrNow, maybeNow) {
  // Back-compat: callers may pass (state) or (state, now) or (state, contract, now)
  let contract, now
  if (typeof contractOrNow === 'number') { contract = null; now = contractOrNow }
  else { contract = contractOrNow; now = maybeNow ?? Date.now() }
  const ac = contract || state.activeContract
  if (!ac) return 0
  const tpl = CONTRACT_TEMPLATES.find(c => c.id === ac.id)
  if (!tpl) return 0
  return Math.max(0, (ac.acceptedAt + tpl.durationMs) - now)
}

export function maxConcurrentContracts(state) {
  const sm = state.specials?.sales
  if (!sm?.hired) return 0
  return (sm.level || 1) + 1   // L1→2, L2→3, L3→4
}

export function activeContractsList(state) {
  if (Array.isArray(state.activeContracts)) return state.activeContracts
  if (state.activeContract) return [state.activeContract]
  return []
}

// ── Milestones ────────────────────────────────────────────────────────────────

// Internal reward helpers (operate on state, return new state)
function mCash(s, n)         { return mkLog({ ...s, money: s.money + n }, `💵 Reward: +$${n}`) }
function mSell(s, pct)       { return { ...s, bonuses: { ...s.bonuses, sell:         (s.bonuses?.sell         || 0) + pct  } } }
function mScrap(s, mult)     { return { ...s, bonuses: { ...s.bonuses, scrapMult:    (s.bonuses?.scrapMult    || 1) * mult } } }
function mHireCost(s, mult)  { return { ...s, bonuses: { ...s.bonuses, hireCostMult: (s.bonuses?.hireCostMult || 1) * mult } } }
function mLotDisc(s, pct)    { return { ...s, bonuses: { ...s.bonuses, lotDisc:      (s.bonuses?.lotDisc      || 0) + pct  } } }
function mUnlock(s, feat)    { return { ...s, features: { ...s.features, [feat]: true } } }

// ── Research tree ────────────────────────────────────────────────────────────
// Reputation earned from completed contracts buys permanent global upgrades.
// Unlocks mutate `bonuses` (same helpers milestones use).

export const RESEARCH = [
  { id: 'fast_audits',   label: 'Faster Intake',    icon: '🔍', cost: 15, stage: 'shop',      desc: '-15% audit time',
    apply: s => ({ ...s, bonuses: { ...s.bonuses, auditSpeedMult: (s.bonuses?.auditSpeedMult || 1) * 0.85 } }) },
  { id: 'cheap_parts',   label: 'Bulk Discount',    icon: '💸', cost: 20, stage: 'shop',      desc: '-10% on all part orders',
    apply: s => ({ ...s, bonuses: { ...s.bonuses, partCostMult: (s.bonuses?.partCostMult || 1) * 0.90 } }) },
  { id: 'speed_tech',    label: 'Tech Training',    icon: '🔧', cost: 30, stage: 'shop',      desc: '-15% repair time',
    apply: s => ({ ...s, bonuses: { ...s.bonuses, repairSpeedMult: (s.bonuses?.repairSpeedMult || 1) * 0.85 } }) },
  { id: 'scrap_master',  label: 'Scrap Master',     icon: '♻️', cost: 25, stage: 'warehouse', desc: '+2 parts per scrap unit',
    apply: s => ({ ...s, bonuses: { ...s.bonuses, scrapBonus: (s.bonuses?.scrapBonus || 0) + 2 } }) },
  { id: 'premium_brand', label: 'Premium Brand',    icon: '✨', cost: 40, stage: 'warehouse', desc: '+5% sell price (all channels)',
    apply: s => mSell(s, 0.05) },
  { id: 'free_shipping', label: 'Freight Deal',     icon: '📬', cost: 50, stage: 'warehouse', desc: '-30% parts delivery time',
    apply: s => ({ ...s, bonuses: { ...s.bonuses, partDeliveryMult: (s.bonuses?.partDeliveryMult || 1) * 0.70 } }) },
  { id: 'rep_compound',  label: 'Repeat Business',  icon: '🤝', cost: 50, stage: 'company',   desc: '+50% reputation from contracts',
    apply: s => ({ ...s, bonuses: { ...s.bonuses, repMult: (s.bonuses?.repMult || 1) * 1.5 } }) },
  { id: 'golden_hands',  label: 'Golden Hands',     icon: '🏆', cost: 75, stage: 'company',   desc: '-20% scrap chance on repair',
    apply: s => mScrap(s, 0.80) },
]

export function researchUnlocked(def, state) {
  const curIdx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
  const reqIdx = EXPANSION_STAGES.findIndex(s => s.id === def.stage)
  return curIdx >= reqIdx
}

export function researchOwned(id, state) {
  return !!state.research?.[id]
}

export function contractRepAward(state) {
  const base = 3
  const mult = state.bonuses?.repMult || 1
  return Math.max(1, Math.round(base * mult))
}

// Research-based per-role duration multiplier (lower = faster).
// 1.0 if no relevant research owned.
export function researchRoleMult(state, roleId) {
  const b = state.bonuses || {}
  if (roleId === 'auditor') return b.auditSpeedMult || 1
  if (roleId === 'tech' || roleId === 'desktopTech') return b.repairSpeedMult || 1
  return 1
}

export const MILESTONES = [
  // ── Grind ────────────────────────────────────────────────────────────────
  { id: 'first_flip',     icon: '🏆', label: 'First Flip',       desc: 'Sell your first unit',              rewardDesc: '+$25',                    progress: s => ({ cur: s.sold,                                       max: 1   }), check: s => s.sold >= 1,                                          reward: s => mCash(s, 25) },
  { id: 'in_business',    icon: '💼', label: 'In Business',       desc: 'Sell 10 units',                     rewardDesc: '+$100',                   progress: s => ({ cur: s.sold,                                       max: 10  }), check: s => s.sold >= 10,                                         reward: s => mCash(s, 100) },
  { id: 'hundred_club',   icon: '💯', label: 'Hundred Club',      desc: 'Sell 100 units',                    rewardDesc: '+$500 · +10% all sales',  progress: s => ({ cur: s.sold,                                       max: 100 }), check: s => s.sold >= 100,                                        reward: s => mSell(mCash(s, 500), 0.10) },
  { id: 'volume_king',    icon: '🏭', label: 'Volume King',       desc: 'Sell 500 units',                    rewardDesc: '+$2,000',                 progress: s => ({ cur: s.sold,                                       max: 500 }), check: s => s.sold >= 500,                                        reward: s => mCash(s, 2000) },
  // ── Money ────────────────────────────────────────────────────────────────
  { id: 'first_grand',    icon: '💰', label: 'First Grand',       desc: 'Hold $1,000 cash',                  rewardDesc: '+$150',                   progress: s => ({ cur: Math.min(s.money, 1000),                      max: 1000  }), check: s => s.money >= 1000,                                   reward: s => mCash(s, 150) },
  { id: 'profit_machine', icon: '📈', label: 'Profit Machine',    desc: '$5,000 net profit',                 rewardDesc: '+$500 · +5% all sales',   progress: s => ({ cur: Math.min(s.totalEarned - s.totalSpent, 5000), max: 5000  }), check: s => (s.totalEarned - s.totalSpent) >= 5000,            reward: s => mSell(mCash(s, 500), 0.05) },
  { id: 'big_business',   icon: '🤑', label: 'Big Business',      desc: '$25,000 net profit',                rewardDesc: '+$2,500',                 progress: s => ({ cur: Math.min(s.totalEarned - s.totalSpent, 25000),max: 25000 }), check: s => (s.totalEarned - s.totalSpent) >= 25000,           reward: s => mCash(s, 2500) },
  // ── Staff ────────────────────────────────────────────────────────────────
  { id: 'first_hire',     icon: '👤', label: 'First Hire',        desc: 'Hire your first worker',            rewardDesc: '+$50',                    progress: null, check: s => Object.values(s.workers).some(w => (w.count || 0) > 0),                                                                            reward: s => mCash(s, 50) },
  { id: 'full_crew',      icon: '👥', label: 'Full Crew',         desc: 'Hire every pipeline role',          rewardDesc: '+$200 · -10% hire costs', progress: s => { const defs = WORKER_DEFS.filter(d => workerStageUnlocked(d, s)); return { cur: defs.filter(d => (s.workers?.[d.id]?.count || 0) > 0).length, max: defs.length } }, check: s => WORKER_DEFS.filter(d => workerStageUnlocked(d, s)).every(d => (s.workers?.[d.id]?.count || 0) > 0), reward: s => mHireCost(mCash(s, 200), 0.9) },
  { id: 'management',     icon: '🎖️', label: 'Management',        desc: 'Hire your first manager',           rewardDesc: '+$250',                   progress: null, check: s => Object.values(s.specials || {}).some(w => w.hired),                                                                     reward: s => mCash(s, 250) },
  // ── Buying ───────────────────────────────────────────────────────────────
  { id: 'bulk_buyer',     icon: '📦', label: 'Bulk Buyer',        desc: 'Buy your first lot',                rewardDesc: '+$30',                    progress: null, check: s => (s.counters?.lotsTotal || 0) >= 1,                                                                                      reward: s => mCash(s, 30) },
  { id: 'shenzhen_reg',   icon: '🐉', label: 'Shenzhen Regular',  desc: 'Buy 50 units from Shenzhen',        rewardDesc: '+$100 · Hidden gems on',  progress: s => ({ cur: Math.min(s.counters?.shenzhenBought || 0, 50), max: 50 }), check: s => (s.counters?.shenzhenBought || 0) >= 50,              reward: s => mUnlock(mCash(s, 100), 'hiddenGems') },
  { id: 'deal_maker',     icon: '🤝', label: 'Deal Maker',        desc: 'Buy a lot of 20+ units',            rewardDesc: '+$150 · +5% lot discount', progress: null, check: s => s.counters?.bigLotPurchased,                                                                                           reward: s => mLotDisc(mCash(s, 150), 0.05) },
  // ── Quality ──────────────────────────────────────────────────────────────
  { id: 'diamond_finder', icon: '💎', label: 'Diamond Finder',    desc: 'Sell a unit for $80+',              rewardDesc: '+$100',                   progress: null, check: s => s.counters?.highValueSold,                                                                                               reward: s => mCash(s, 100) },
  { id: 'clean_streak',   icon: '🧹', label: 'Clean Streak',      desc: '10 repairs without a scrap',        rewardDesc: '+$75 · -20% scrap chance',progress: s => ({ cur: Math.min(s.counters?.noScrapStreak || 0, 10), max: 10 }), check: s => (s.counters?.noScrapStreak || 0) >= 10,                reward: s => mScrap(mCash(s, 75), 0.8) },
  // ── Bulk ─────────────────────────────────────────────────────────────────
  { id: 'big_shipment',   icon: '🚀', label: 'Big Shipment',      desc: 'Ship 10 units in one click',        rewardDesc: '+$300 · +5% all sales',   progress: s => ({ cur: Math.min(s.counters?.biggestBatch || 0, 10), max: 10 }), check: s => (s.counters?.biggestBatch || 0) >= 10,                  reward: s => mSell(mCash(s, 300), 0.05) },
  // ── Expansion ────────────────────────────────────────────────────────────
  { id: 'reached_warehouse', icon: '🏭', label: 'Warehouse Era',   desc: 'Expand to Warehouse',               rewardDesc: '+$500',                   progress: null, check: s => EXPANSION_STAGES.findIndex(x => x.id === s.expansionStage) >= 2, reward: s => mCash(s, 500) },
  { id: 'reached_company',   icon: '🏢', label: 'Corporate Office', desc: 'Expand to Company',                rewardDesc: '+$2,500 · +5% all sales', progress: null, check: s => EXPANSION_STAGES.findIndex(x => x.id === s.expansionStage) >= 3, reward: s => mSell(mCash(s, 2500), 0.05) },
  { id: 'reached_regional',  icon: '🏙️', label: 'Going Regional',   desc: 'Expand to Regional HQ',            rewardDesc: '+$10,000',                progress: null, check: s => EXPANSION_STAGES.findIndex(x => x.id === s.expansionStage) >= 4, reward: s => mCash(s, 10000) },
  // ── Facilities ───────────────────────────────────────────────────────────
  { id: 'first_facility',    icon: '🛠️', label: 'Renovator',        desc: 'Install your first facility',      rewardDesc: '+$200',                   progress: null, check: s => Object.values(s.facilities || {}).some(v => v),                   reward: s => mCash(s, 200) },
  { id: 'fully_equipped',    icon: '🏗️', label: 'Fully Equipped',   desc: 'Install all 6 facilities',         rewardDesc: '+$5,000 · +10% all sales', progress: s => ({ cur: Object.values(s.facilities || {}).filter(v => v).length, max: 6 }), check: s => Object.values(s.facilities || {}).filter(v => v).length >= 6, reward: s => mSell(mCash(s, 5000), 0.10) },
  // ── Events ───────────────────────────────────────────────────────────────
  { id: 'risk_taker',        icon: '🎲', label: 'Risk Taker',       desc: 'Resolve your first decision',      rewardDesc: '+$50',                    progress: null, check: s => (s.counters?.eventsResolved || 0) >= 1,                            reward: s => mCash(s, 50) },
  { id: 'battle_hardened',   icon: '🛡️', label: 'Battle Hardened',  desc: 'Resolve 10 decisions',             rewardDesc: '+$500 · +5% all sales',   progress: s => ({ cur: Math.min(s.counters?.eventsResolved || 0, 10), max: 10 }), check: s => (s.counters?.eventsResolved || 0) >= 10,                          reward: s => mSell(mCash(s, 500), 0.05) },
  // ── Contracts ────────────────────────────────────────────────────────────
  { id: 'first_contract',    icon: '📝', label: 'Signed & Delivered', desc: 'Fulfill your first contract',    rewardDesc: '+$500',                   progress: null, check: s => (s.counters?.contractsDone || 0) >= 1,                              reward: s => mCash(s, 500) },
  { id: 'contract_veteran',  icon: '🏢', label: 'Contract Veteran',  desc: 'Fulfill 10 contracts',             rewardDesc: '+$5,000 · +10% all sales', progress: s => ({ cur: Math.min(s.counters?.contractsDone || 0, 10), max: 10 }), check: s => (s.counters?.contractsDone || 0) >= 10,                             reward: s => mSell(mCash(s, 5000), 0.10) },
  // ── Variety ──────────────────────────────────────────────────────────────
  { id: 'device_collector',  icon: '🎒', label: 'Device Collector', desc: 'Sell every unlocked device type',  rewardDesc: '+$500 · +5% all sales',   progress: s => {
      const stageIdx = EXPANSION_STAGES.findIndex(x => x.id === s.expansionStage)
      const unlocked = DEVICE_TYPES.filter(d => EXPANSION_STAGES.findIndex(x => x.id === d.unlockStage) <= stageIdx).length
      const sold = (s.counters?.typesSold || []).length
      return { cur: Math.min(sold, unlocked), max: unlocked }
    }, check: s => {
      const stageIdx = EXPANSION_STAGES.findIndex(x => x.id === s.expansionStage)
      const unlocked = DEVICE_TYPES.filter(d => EXPANSION_STAGES.findIndex(x => x.id === d.unlockStage) <= stageIdx).map(d => d.id)
      const sold = s.counters?.typesSold || []
      return unlocked.length >= 2 && unlocked.every(id => sold.includes(id))
    }, reward: s => mSell(mCash(s, 500), 0.05) },
  // ── Endgame ──────────────────────────────────────────────────────────────
  { id: 'six_figure',        icon: '💎', label: 'Six Figure Club',  desc: '$100,000 lifetime earned',         rewardDesc: '+$5,000',                 progress: s => ({ cur: Math.min(s.totalEarned, 100000), max: 100000 }), check: s => s.totalEarned >= 100000,  reward: s => mCash(s, 5000) },
  { id: 'millionaire',       icon: '🏆', label: 'Millionaire',      desc: '$1,000,000 lifetime earned',       rewardDesc: '+$50,000 · +10% all sales', progress: s => ({ cur: Math.min(s.totalEarned, 1000000), max: 1000000 }), check: s => s.totalEarned >= 1000000, reward: s => mSell(mCash(s, 50000), 0.10) },
  { id: 'power_seller',      icon: '⚡', label: 'Power Seller',     desc: 'Sell 1,000 units',                 rewardDesc: '+$3,000 · +5% all sales', progress: s => ({ cur: Math.min(s.sold, 1000), max: 1000 }), check: s => s.sold >= 1000, reward: s => mSell(mCash(s, 3000), 0.05) },
  { id: 'empire',            icon: '👑', label: 'Empire',           desc: 'Sell 10,000 units',                rewardDesc: '+$25,000 · +10% all sales', progress: s => ({ cur: Math.min(s.sold, 10000), max: 10000 }), check: s => s.sold >= 10000, reward: s => mSell(mCash(s, 25000), 0.10) },
  // ── Secret ───────────────────────────────────────────────────────────────
  { id: 'double_dip',        icon: '🎭', label: 'Double Dip',       desc: '🕵️ Secret: fulfill two contracts with one shipment',
    rewardDesc: '+$1,000 · Permanent +5% contract rewards',
    secret: true,
    progress: null,
    check: s => !!s.counters?.doubleDipTriggered,
    reward: s => mCash({ ...s, bonuses: { ...s.bonuses, contractRewardMult: (s.bonuses?.contractRewardMult || 1) * 1.05 } }, 1000) },
  { id: 'clutch_ship',       icon: '⏱️', label: 'Buzzer Beater',    desc: '🕵️ Secret: fulfill a contract with under 5s left',
    rewardDesc: '+$1,500 · Permanent +5% sell price',
    secret: true,
    progress: null,
    check: s => !!s.counters?.clutchShipTriggered,
    reward: s => mSell(mCash(s, 1500), 0.05) },
]

export function checkMilestones(state) {
  let s = state
  const unclaimed = s.unclaimedMilestones || []
  for (const m of MILESTONES) {
    if (s.earned.includes(m.id)) continue
    if (unclaimed.includes(m.id)) continue
    if (!m.check(s)) continue
    s = { ...s, unclaimedMilestones: [...(s.unclaimedMilestones || []), m.id] }
    s = mkLog(s, `🏅 MILESTONE READY: ${m.icon} ${m.label} — tap to claim ${m.rewardDesc}`)
  }
  return s
}

export function claimMilestone(state, id) {
  const m = MILESTONES.find(x => x.id === id)
  if (!m) return state
  const unclaimed = state.unclaimedMilestones || []
  if (!unclaimed.includes(id)) return state
  if (state.earned.includes(id)) return state
  let s = {
    ...state,
    unclaimedMilestones: unclaimed.filter(x => x !== id),
    earned: [...state.earned, id],
  }
  s = mkLog(s, `🎁 Claimed ${m.icon} ${m.label}: ${m.rewardDesc}`)
  s = m.reward(s)
  return s
}

// ── State ─────────────────────────────────────────────────────────────────────

export function makeInitialState() {
  return {
    money: 200,
    pipeline: { incoming: [], unchecked: [], audited: [], repaired: [], cleaned: [], imaged: [], packed: [], scrapped: [] },
    parts: 0,
    partsIncoming: [],
    lotsIncoming: [],
    workers: Object.fromEntries(WORKER_DEFS.map(d => [
      d.id,
      d.perHire ? { count: 0, level: 1, hireLevels: [] } : { count: 0, level: 1 },
    ])),
    specials: Object.fromEntries(SPECIAL_HIRES.map(d => [d.id, { hired: false, level: 1 }])),
    expansionStage: 'garage',
    stageUpgradedAtSold: 0,
    activeSupplier: 'wholesale',
    activeChannel: 'ebay',
    sold: 0,
    totalEarned: 0,
    totalSpent: 0,
    totalFees: 0,
    bestProfit: 0,
    earned: [],
    unclaimedMilestones: [],
    lang: (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es')) ? 'es' : 'en',
    bonuses: { sell: 0, hireCostMult: 1, lotDisc: 0, scrapMult: 1 },
    buffs: [],
    morale: 60,
    lastMoraleDecayAt: Date.now(),
    lastPayrollAt: Date.now(),
    lastActiveAt: Date.now(),
    bossUntil: 0,
    bossCooldownUntil: 0,
    reputation: 0,
    research: {},
    activeShopId: 'main',
    shops: [{ id: 'main', name: 'Home Shop', icon: '🏠', openedAt: Date.now() }],
    counters: { shenzhenBought: 0, lotsTotal: 0, bigLotPurchased: false, noScrapStreak: 0, highValueSold: false, diamondFound: false, biggestBatch: 0, audited: 0, repaired: 0, scrapped: 0, imaged: 0, cleaned: 0, packed: 0, bought: 0, eventsResolved: 0, typesSold: [], typeSoldCount: {}, contractsDone: 0, contractsFailed: 0 },
    features: { hiddenGems: false },
    facilities: Object.fromEntries(FACILITIES.map(f => [f.id, false])),
    activeEvent: null,
    lastEventAt: 0,
    activeContract: null,
    activeContracts: [],
    log: [],
    lots: [],
    vendorStats: {},
    settings: { autoResolve: 'safe' },   // Floor Manager L3: 'safe' | 'greedy'
  }
}

export function lotsInPipeline(state) {
  const live = new Set()
  for (const arr of Object.values(state.pipeline || {})) {
    for (const u of arr) if (u?.lotId) live.add(u.lotId)
  }
  return live
}

export function pruneLots(state) {
  const live = lotsInPipeline(state)
  const next = (state.lots || []).filter(l => live.has(l.id))
  if (next.length === (state.lots || []).length) return state
  return { ...state, lots: next }
}

function bumpVendor(stats, supplierId, delta) {
  const base = stats?.[supplierId] || { lots: 0, bought: 0, spent: 0, sold: 0, revenue: 0, scrapped: 0 }
  return { ...stats, [supplierId]: { ...base, ...Object.fromEntries(Object.entries(delta).map(([k, v]) => [k, (base[k] || 0) + v])) } }
}

// ── Reducer ───────────────────────────────────────────────────────────────────

// Group-collapse rule: two entries with the same key + same "group" arg
// (e.g. the vendor icon on a buy / shipment) collapse into a single row
// with a count bump. Keeps the feed readable when bulk actions fire.
const LOG_GROUP_KEYS = {
  'log.bought':          'vendor',
  'log.shipmentArrived': 'vendor',
}

// mkLog(state, 'log.bought', { vendor, ...args })   -- structured, translatable
// mkLog(state, '🛒 raw string')                     -- backward compat (pre-i18n saves)
//
// Entries are shaped { id, t, key?, args?, msg?, count }. The UI resolves
// `key`+`args` through i18n when present and falls back to `msg`.
function mkLog(state, keyOrMsg, args) {
  const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const isKey = typeof keyOrMsg === 'string' && keyOrMsg.startsWith('log.')
  const entry = isKey
    ? { id: uid(), key: keyOrMsg, args: args || {}, t, count: 1 }
    : { id: uid(), msg: String(keyOrMsg ?? ''), t, count: 1 }

  const head = state.log?.[0]
  if (head) {
    // Exact match collapse: same key + same args, or same raw msg
    const sameKey = isKey && head.key === entry.key
      && JSON.stringify(head.args || {}) === JSON.stringify(entry.args || {})
    const sameMsg = !isKey && head.msg === entry.msg
    if (sameKey || sameMsg) {
      const bumped = { ...head, count: (head.count || 1) + 1, t }
      return { ...state, log: [bumped, ...state.log.slice(1)] }
    }
    // Same-group collapse (e.g. buys from the same vendor in a row)
    if (isKey && head.key === entry.key && LOG_GROUP_KEYS[entry.key]) {
      const groupArg = LOG_GROUP_KEYS[entry.key]
      if ((head.args || {})[groupArg] === (entry.args || {})[groupArg]) {
        const n = (head.count || 1) + 1
        return { ...state, log: [{ ...head, count: n, t }, ...state.log.slice(1)] }
      }
    }
  }
  return { ...state, log: [entry, ...state.log].slice(0, 60) }
}

export function reducer(state, action) {
  const p = state.pipeline

  switch (action.type) {

    case 'SET_SUPPLIER': {
      const sup = SUPPLIERS.find(s => s.id === action.payload)
      if (!sup || !supplierUnlocked(sup, state)) return state
      return { ...state, activeSupplier: action.payload }
    }

    case 'SET_CHANNEL': {
      const ch = CHANNELS.find(c => c.id === action.payload)
      if (!ch || !channelUnlocked(ch, state)) return state
      return { ...state, activeChannel: action.payload }
    }

    case 'BUY': {
      const sup    = SUPPLIERS.find(s => s.id === state.activeSupplier) || SUPPLIERS[1]
      const typeId = action.payload?.type || null
      const lotId  = `L${uid()}`
      const now    = Date.now()
      const laptop = { ...createLaptop(sup, state.expansionStage, typeId), lotId, purchasedAt: now }
      if (state.money < laptop.buyPrice) return mkLog(state, '❌ Not enough cash!')
      const ctr = state.counters
      const newCounters = {
        ...ctr,
        bought: (ctr?.bought || 0) + 1,
        shenzhenBought: (ctr?.shenzhenBought || 0) + (sup.id === 'shenzhen' ? 1 : 0),
      }
      const lotRecord = {
        id: lotId, supplierId: sup.id, supplierLabel: sup.label, supplierIcon: sup.icon,
        typeFilter: typeId, purchasedAt: now, qty: 1, cost: laptop.buyPrice,
      }
      const vendorStats = bumpVendor(state.vendorStats, sup.id, { lots: 1, bought: 1, spent: laptop.buyPrice })
      let s = mkLog({
        ...state,
        money: state.money - laptop.buyPrice,
        totalSpent: state.totalSpent + laptop.buyPrice,
        pipeline: { ...p, unchecked: [...p.unchecked, laptop] },
        counters: newCounters,
        lots: [lotRecord, ...(state.lots || [])].slice(0, 30),
        vendorStats,
      }, `🛒 [${sup.icon}] Bought ${laptop.quality} ${typeInfo(laptop.type).icon} ${typeInfo(laptop.type).label} · paid $${laptop.buyPrice} · est. $${laptop.sellPrice}`)
      return checkMilestones(s)
    }

    case 'BUY_LOT': {
      const sup      = SUPPLIERS.find(s => s.id === state.activeSupplier) || SUPPLIERS[1]
      const qty      = typeof action.payload === 'number' ? action.payload : action.payload.qty
      const typeId   = typeof action.payload === 'object' ? action.payload.type : null
      const discount = LOT_DISCOUNT[qty] || 0
      const lotId    = `L${uid()}`
      const now      = Date.now()
      const stamp    = u => ({ ...u, lotId, purchasedAt: now })
      const laptops  = Array.from({ length: qty }, () => stamp(createLaptop(sup, state.expansionStage, typeId)))
      const connection = agentConnectionRoll(state)
      const extraDisc  = connection?.extraDiscount || 0
      const totalDiscount = Math.min(0.75, discount + agentLotDiscount(state) + extraDisc + (state.bonuses?.lotDisc || 0) + (sup.lotDiscBonus || 0))
      const total    = Math.round(laptops.reduce((s, l) => s + l.buyPrice, 0) * (1 - totalDiscount))
      if (state.money < total) return mkLog(state, `❌ Need $${total} for a lot of ${qty}`)

      // Store Returns: chance of a free sealed unit (forced 'good' quality)
      let sealedBonus = null
      if (sup.sealedChance && Math.random() < sup.sealedChance) {
        const base = createLaptop(sup, state.expansionStage, typeId)
        sealedBonus = stamp({ ...base, id: uid(), quality: 'good', buyPrice: 0, sellPrice: Math.round(base.sellPrice * 1.2) })
      }
      const allUnits = sealedBonus ? [...laptops, sealedBonus] : laptops

      const perUnit  = Math.round(total / qty)
      const ctr      = state.counters
      const newCounters = {
        ...ctr,
        bought:          (ctr?.bought || 0) + allUnits.length,
        lotsTotal:       (ctr?.lotsTotal || 0) + 1,
        bigLotPurchased: (ctr?.bigLotPurchased || false) || qty >= 20,
        shenzhenBought:  (ctr?.shenzhenBought || 0) + (sup.id === 'shenzhen' ? qty : 0),
      }
      const lotRecord = {
        id: lotId,
        supplierId: sup.id,
        supplierLabel: sup.label,
        supplierIcon: sup.icon,
        typeFilter: typeId,
        purchasedAt: now,
        qty: allUnits.length,
        cost: total,
      }
      const vendorStats = bumpVendor(state.vendorStats, sup.id, { lots: 1, bought: allUnits.length, spent: total })
      const baseDeliverySec = sup.deliverySec ?? 10
      const deliverySec = connection?.instantShip ? 0 : Math.max(0, Math.round(baseDeliverySec * agentDeliveryMult(state)))
      const arriveAt = now + deliverySec * 1000
      const shipment = {
        lotId, units: allUnits, arriveAt,
        supplierId: sup.id, supplierLabel: sup.label, supplierIcon: sup.icon,
        qty: allUnits.length,
      }
      const etaLabel = deliverySec === 0 ? 'instant' : `ETA ${deliverySec}s`
      let s = mkLog({
        ...state,
        money: state.money - total,
        totalSpent: state.totalSpent + total,
        lotsIncoming: [...(state.lotsIncoming || []), shipment],
        counters: newCounters,
        lots: [lotRecord, ...(state.lots || [])].slice(0, 30),
        vendorStats,
      }, `📦 [${sup.icon}] Lot ×${qty} · paid $${total} · ~$${perUnit}/unit (${Math.round(totalDiscount * 100)}% off) · ${summarizeMix(laptops)} · ${etaLabel}`)
      if (connection) s = mkLog(s, `🤝 Connection made! +10% off and free shipping this lot.`)
      if (sealedBonus) s = mkLog(s, `🎁 Sealed bonus unit! +1 good ${typeInfo(sealedBonus.type).icon} from the pallet.`)
      for (const ev of sup.events) {
        if (Math.random() < ev.chance) s = mkLog(s, ev.key)
      }
      return checkMilestones(s)
    }

    case 'ORDER_PARTS': {
      const src = PART_SOURCES.find(p => p.id === action.payload)
      if (!src) return state
      const depot   = !!state.facilities?.partsDepot
      const costMult = (depot ? 0.80 : 1) * (state.bonuses?.partCostMult || 1)
      const etaMult  = (depot ? 0.75 : 1) * (state.bonuses?.partDeliveryMult || 1)
      const cost    = Math.round(src.cost * costMult)
      const etaSec  = Math.round(src.deliverySec * etaMult)
      if (state.money < cost) return mkLog(state, `❌ Need $${cost} to order from ${src.label}`)
      const arriveAt = Date.now() + etaSec * 1000
      return mkLog({
        ...state,
        money: state.money - cost,
        totalSpent: state.totalSpent + cost,
        partsIncoming: [...(state.partsIncoming || []), { qty: src.qty, arriveAt, sourceId: src.id }],
      }, `${src.icon} Ordered ${src.qty} parts from ${src.label} — ETA ${etaSec}s`)
    }

    case 'RECEIVE_LOT': {
      const now = Date.now()
      const pending = state.lotsIncoming || []
      const arrived = pending.filter(o => o.arriveAt <= now)
      if (arrived.length === 0) return state
      const incomingUnits = arrived.flatMap(o => o.units || [])
      let s = {
        ...state,
        pipeline: { ...p, incoming: [...(p.incoming || []), ...incomingUnits] },
        lotsIncoming: pending.filter(o => o.arriveAt > now),
      }
      for (const o of arrived) s = mkLog(s, `🚚 [${o.supplierIcon}] Shipment ×${o.qty} arrived · unloading…`)
      return s
    }

    case 'RECEIVE_PARTS': {
      const now = Date.now()
      const arrived = (state.partsIncoming || []).filter(o => o.arriveAt <= now)
      if (arrived.length === 0) return state
      const totalQty = arrived.reduce((n, o) => n + o.qty, 0)
      let s = {
        ...state,
        parts: (state.parts || 0) + totalQty,
        partsIncoming: (state.partsIncoming || []).filter(o => o.arriveAt > now),
      }
      for (const o of arrived) s = mkLog(s, `📦 Parts arrived: +${o.qty} (${o.sourceId === 'china' ? '🐉' : '🚚'})`)
      return s
    }

    case 'CONSUME_PARTS': {
      const n = action.payload || 1
      return { ...state, parts: Math.max(0, (state.parts || 0) - n) }
    }

    case 'SCRAP_PART_OUT': {
      const pile = p.scrapped || []
      if (pile.length === 0) return state
      const depot = !!state.facilities?.partsDepot
      const perUnit = SCRAP_PART_YIELD + (depot ? 2 : 0) + (state.bonuses?.scrapBonus || 0)
      const gained = pile.length * perUnit
      return pruneLots(mkLog({
        ...state,
        parts: (state.parts || 0) + gained,
        pipeline: { ...p, scrapped: [] },
      }, `🔧 Parted out ${pile.length} scrap units · +${gained} parts`))
    }

    case 'SCRAP_SELL_JUNK': {
      const pile = p.scrapped || []
      if (pile.length === 0) return state
      const cash = pile.length * SCRAP_JUNK_PER_UNIT
      return pruneLots(mkLog({
        ...state,
        money: state.money + cash,
        totalEarned: state.totalEarned + cash,
        pipeline: { ...p, scrapped: [] },
      }, `♻️ Sold ${pile.length} units for scrap · +$${cash}`))
    }

    case 'SCRAP_SELL_EBAY': {
      if (!scrapEbayUnlocked(state)) return state
      const pile = p.scrapped || []
      if (pile.length === 0) return state
      let gross = 0
      let hot = 0
      let collector = 0
      let vendorStats = state.vendorStats
      for (const u of pile) {
        const base = Math.round((u.sellPrice || 0) * SCRAP_EBAY_MULT)
        const r = Math.random()
        let mult = 1
        if (r < 0.02) { mult = 5; collector++ }
        else if (r < 0.12) { mult = 2; hot++ }
        const pay = base * mult
        gross += pay
        if (u.supplierId) vendorStats = bumpVendor(vendorStats, u.supplierId, { revenue: pay })
      }
      let s = pruneLots({
        ...state,
        money: state.money + gross,
        totalEarned: state.totalEarned + gross,
        pipeline: { ...p, scrapped: [] },
        vendorStats,
      })
      s = mkLog(s, `📦 Listed ${pile.length} as-is on eBay · +$${gross}`)
      if (hot > 0)       s = mkLog(s, `🔥 Hot listing${hot > 1 ? `s (${hot})` : ''}! 2× payout.`)
      if (collector > 0) s = mkLog(s, `🎰 Collector bid war${collector > 1 ? ` ×${collector}` : ''}! 5× payout.`)
      return s
    }

    case 'DRIP_INCOMING': {
      const incoming = p.incoming || []
      if (incoming.length === 0) return state
      const n = Math.min(action.payload || 1, incoming.length)
      const moving = incoming.slice(0, n)
      return {
        ...state,
        pipeline: {
          ...p,
          incoming: incoming.slice(n),
          unchecked: [...p.unchecked, ...moving],
        },
      }
    }

    case 'COMPLETE_AUDIT': {
      const ev = action.payload
      let laptop, remaining
      if (ev?.unitId) {
        const idx = p.unchecked.findIndex(u => u.id === ev.unitId)
        if (idx < 0) return state
        laptop    = p.unchecked[idx]
        remaining = [...p.unchecked.slice(0, idx), ...p.unchecked.slice(idx + 1)]
      } else {
        laptop    = p.unchecked[0]
        remaining = p.unchecked.slice(1)
      }
      if (!laptop) return state
      const updated = {
        ...laptop,
        sellPrice: Math.round(laptop.sellPrice * ev.sellMod),
        repairBonusMs: ev.repairBonusMs,
        imageBonusMs: ev.imageBonusMs,
      }
      let np = { ...p, unchecked: remaining }
      np = ev.skipRepair
        ? { ...np, repaired: [...np.repaired, updated] }
        : { ...np, audited: [...np.audited, updated] }
      const auditCounters = {
        ...state.counters,
        audited:  (state.counters?.audited  || 0) + 1,
        repaired: (state.counters?.repaired || 0) + (ev.skipRepair ? 1 : 0),
      }
      let s = { ...state, pipeline: np, counters: auditCounters }
      for (const m of ev.msgs) s = mkLog(s, m.key, m.args)
      return s
    }

    case 'COMPLETE_REPAIR': {
      const ev = action.payload
      // If unitId specified (split-tech routing), remove that unit; else head.
      let laptop, remaining
      if (ev.unitId) {
        const idx = p.audited.findIndex(u => u.id === ev.unitId)
        if (idx < 0) return state
        laptop   = p.audited[idx]
        remaining = [...p.audited.slice(0, idx), ...p.audited.slice(idx + 1)]
      } else {
        laptop   = p.audited[0]
        remaining = p.audited.slice(1)
      }
      if (!laptop) return state
      let np = { ...p, audited: remaining }
      let vendorStats = state.vendorStats
      let parts = state.parts || 0
      let salvageMsg = null
      if (!ev.scrapped) {
        const updated = { ...laptop, sellPrice: Math.round(laptop.sellPrice * ev.sellMod) }
        np = { ...np, repaired: [...np.repaired, updated] }
      } else {
        // Failed repair — unit goes to the scrap pile (part out / junk / eBay as-is)
        np = { ...np, scrapped: [...(np.scrapped || []), laptop] }
        if (laptop.supplierId) vendorStats = bumpVendor(vendorStats, laptop.supplierId, { scrapped: 1 })
        // Inventory Mgr parts salvage on failed repair: reclaim partsNeeded back at salvagePct rate
        const salvagePct = invMgrSalvagePct(state)
        if (salvagePct > 0) {
          const needed = partsNeeded(laptop.quality)
          let recovered = 0
          for (let i = 0; i < needed; i++) {
            if (Math.random() < salvagePct) recovered++
          }
          if (recovered > 0) {
            parts += recovered
            salvageMsg = { key: 'log.repair.invMgrSalvage', args: { n: recovered } }
          }
        }
      }
      const noScrapStreak = ev.scrapped ? 0 : (state.counters?.noScrapStreak || 0) + 1
      let s = { ...state, pipeline: np, parts, vendorStats, counters: {
        ...state.counters,
        noScrapStreak,
        repaired: (state.counters?.repaired || 0) + (ev.scrapped ? 0 : 1),
        scrapped: (state.counters?.scrapped || 0) + (ev.scrapped ? 1 : 0),
      } }
      for (const m of ev.msgs) s = mkLog(s, m.key, m.args)
      if (salvageMsg) s = mkLog(s, salvageMsg.key, salvageMsg.args)
      return checkMilestones(s)
    }

    case 'COMPLETE_IMAGE': {
      const unitId = action.payload?.unitId
      let laptop, remaining
      if (unitId) {
        const idx = p.repaired.findIndex(u => u.id === unitId)
        if (idx < 0) return state
        laptop    = p.repaired[idx]
        remaining = [...p.repaired.slice(0, idx), ...p.repaired.slice(idx + 1)]
      } else {
        laptop    = p.repaired[0]
        remaining = p.repaired.slice(1)
      }
      if (!laptop) return state
      return {
        ...state,
        pipeline: { ...p, repaired: remaining, imaged: [...p.imaged, laptop] },
        counters: { ...state.counters, imaged: (state.counters?.imaged || 0) + 1 },
      }
    }

    case 'COMPLETE_CLEAN': {
      const unitId = action.payload?.unitId
      let laptop, remaining
      if (unitId) {
        const idx = p.imaged.findIndex(u => u.id === unitId)
        if (idx < 0) return state
        laptop    = p.imaged[idx]
        remaining = [...p.imaged.slice(0, idx), ...p.imaged.slice(idx + 1)]
      } else {
        laptop    = p.imaged[0]
        remaining = p.imaged.slice(1)
      }
      if (!laptop) return state
      return {
        ...state,
        pipeline: { ...p, imaged: remaining, cleaned: [...p.cleaned, laptop] },
        counters: { ...state.counters, cleaned: (state.counters?.cleaned || 0) + 1 },
      }
    }

    case 'COMPLETE_PACK': {
      const unitId = action.payload?.unitId
      let laptop, remaining
      if (unitId) {
        const idx = p.cleaned.findIndex(u => u.id === unitId)
        if (idx < 0) return state
        laptop    = p.cleaned[idx]
        remaining = [...p.cleaned.slice(0, idx), ...p.cleaned.slice(idx + 1)]
      } else {
        laptop    = p.cleaned[0]
        remaining = p.cleaned.slice(1)
      }
      if (!laptop) return state
      return {
        ...state,
        pipeline: { ...p, cleaned: remaining, packed: [...p.packed, laptop] },
        counters: { ...state.counters, packed: (state.counters?.packed || 0) + 1 },
      }
    }

    case 'COMPLETE_SHIP': {
      const laptop = p.packed[0]
      if (!laptop) return state
      const ch     = activeChannel(state)
      const fMult  = facilitySellMult(state, laptop, ch)
      const bidWar = rollBidWar(state)
      const gross  = Math.round(laptop.sellPrice * salesBonusMult(state) * ch.sellMult * fMult * (bidWar ? 2 : 1))
      const fee    = Math.round(gross * ch.feePct * salesFeeMult(state))
      const net    = gross - fee
      const profit = net - laptop.buyPrice
      const newSold = state.sold + 1
      const existingTypes = state.counters?.typesSold || []
      const prevTypeCount = state.counters?.typeSoldCount || {}
      const tId = laptop.type || 'laptop'
      const newCounters = {
        ...state.counters,
        highValueSold: (state.counters?.highValueSold || false) || net >= 80,
        typesSold: existingTypes.includes(tId) ? existingTypes : [...existingTypes, tId],
        typeSoldCount: { ...prevTypeCount, [tId]: (prevTypeCount[tId] || 0) + 1 },
      }
      const vendorStats = laptop.supplierId
        ? bumpVendor(state.vendorStats, laptop.supplierId, { sold: 1, revenue: net })
        : state.vendorStats
      let s = mkLog({
        ...state,
        money: state.money + net,
        sold: newSold,
        totalEarned: state.totalEarned + net,
        totalFees:   (state.totalFees || 0) + fee,
        bestProfit:  Math.max(state.bestProfit, profit),
        pipeline: { ...p, packed: p.packed.slice(1) },
        counters: newCounters,
        vendorStats,
      }, `🚚 [${ch.icon} ${ch.label}] Sold $${gross}${fee ? ` - $${fee} fee` : ''} = $${net} · profit ${profit >= 0 ? '+' : ''}$${profit}`)
      if (bidWar) s = mkLog(s, `🔥 Bidding war! 2× payout — buyers went nuts.`)
      s = pruneLots(s)

      const wasReady = !!expansionReady(state)
      const isReady  = !!expansionReady(s)
      if (isReady && !wasReady) {
        const next = nextExpansion(s)
        s = mkLog(s, `🏆 ${next.label} unlocked! Upgrade in the topbar for $${next.cost.toLocaleString()}.`)
      }
      return checkMilestones(s)
    }

    case 'BULK_SHIP': {
      const laptops = p.packed
      if (!laptops.length) return state
      const ch = activeChannel(state)
      let totalNet = 0, totalFees = 0, totalProfit = 0, bestProfit = state.bestProfit
      let highValue = state.counters?.highValueSold || false
      let bidWars = 0
      const feeMult = salesFeeMult(state)
      const perVendor = {}
      for (const laptop of laptops) {
        const fMult = facilitySellMult(state, laptop, ch)
        const bidWar = rollBidWar(state)
        if (bidWar) bidWars++
        const gross = Math.round(laptop.sellPrice * salesBonusMult(state) * ch.sellMult * fMult * (bidWar ? 2 : 1))
        const fee   = Math.round(gross * ch.feePct * feeMult)
        const net   = gross - fee
        totalNet   += net
        totalFees  += fee
        totalProfit += net - laptop.buyPrice
        bestProfit  = Math.max(bestProfit, net - laptop.buyPrice)
        if (net >= 80) highValue = true
        const sid = laptop.supplierId
        if (sid) {
          const cur = perVendor[sid] || { sold: 0, revenue: 0 }
          perVendor[sid] = { sold: cur.sold + 1, revenue: cur.revenue + net }
        }
      }
      const newSold = state.sold + laptops.length
      let vendorStats = state.vendorStats
      for (const [sid, d] of Object.entries(perVendor)) vendorStats = bumpVendor(vendorStats, sid, d)
      let s = mkLog({
        ...state,
        money:       state.money + totalNet,
        sold:        newSold,
        totalEarned: state.totalEarned + totalNet,
        totalFees:   (state.totalFees || 0) + totalFees,
        bestProfit,
        pipeline:    { ...p, packed: [] },
        vendorStats,
        counters: {
          ...state.counters,
          highValueSold: highValue,
          biggestBatch:  Math.max(state.counters?.biggestBatch || 0, laptops.length),
          typesSold:     Array.from(new Set([...(state.counters?.typesSold || []), ...laptops.map(l => l.type || 'laptop')])),
          typeSoldCount: laptops.reduce((acc, l) => { const t = l.type || 'laptop'; return { ...acc, [t]: (acc[t] || 0) + 1 } }, { ...(state.counters?.typeSoldCount || {}) }),
        },
      }, laptops.length === 1
        ? `🚚 [${ch.icon} ${ch.label}] Sold for $${totalNet} · profit ${totalProfit >= 0 ? '+' : ''}$${totalProfit}`
        : `🚀 [${ch.icon} ${ch.label}] Bulk ×${laptops.length} · $${totalNet} net${totalFees ? ` (−$${totalFees} fees)` : ''} · ${totalProfit >= 0 ? '+' : ''}$${totalProfit} profit`)
      if (bidWars > 0) s = mkLog(s, `🔥 Bidding war on ${bidWars} unit${bidWars > 1 ? 's' : ''} — 2× payout.`)
      const wasReady = !!expansionReady(state)
      const isReady  = !!expansionReady(s)
      if (isReady && !wasReady) {
        const next = nextExpansion(s)
        s = mkLog(s, `🏆 ${next.label} unlocked! Upgrade in the topbar for $${next.cost.toLocaleString()}.`)
      }
      s = pruneLots(s)
      return checkMilestones(s)
    }

    case 'EXPAND_ACCEPT': {
      const next = expansionReady(state)
      if (!next) return state
      const cost = next.cost || 0
      const grant = next.grant || 0
      if ((state.money || 0) < cost) return mkLog(state, `❌ Need $${cost.toLocaleString()} to upgrade to ${next.label}.`)
      const grantNote = grant > 0 ? ` Startup grant: +$${grant.toLocaleString()}.` : ''
      const s = mkLog({
        ...state,
        money: state.money - cost + grant,
        totalSpent: (state.totalSpent || 0) + cost,
        totalEarned: (state.totalEarned || 0) + grant,
        expansionStage: next.id,
        stageUpgradedAtSold: state.sold || 0,
        lastPayrollAt: Date.now() + STAGE_PAYROLL_GRACE_MS,
      }, `🎉 UPGRADED to ${next.label} for $${cost.toLocaleString()}!${grantNote} Lot buying: ${next.lots.filter(n => n > 1).join(', ')} units. Payroll paused 2 min.`)
      return checkMilestones(s)
    }

    case 'HIRE_WORKER': {
      const def  = WORKER_DEFS.find(d => d.id === action.payload)
      if (!def) return state
      const fallback = def.perHire ? { count: 0, level: 1, hireLevels: [] } : { count: 0, level: 1 }
      const worker = state.workers[def.id] || fallback
      const maxCount = workerMaxCount(def, state)
      if (worker.count >= maxCount) return mkLog(state, `❌ ${def.label} capped at ${maxCount} for this stage — expand to hire more.`)
      const cost = workerHireCost(def, worker.count, state)
      if (state.money < cost) return mkLog(state, `❌ Need $${cost} to hire ${def.label}`)
      const nextCount = worker.count + 1
      // First-tech onboarding: gift 3 parts so they can actually start repairing
      const giftParts = (def.id === 'tech' && worker.count === 0 && (state.parts || 0) === 0) ? 3 : 0
      // Anchor the upgrade gate to current sold count on first hire, so the crew
      // has to actually ship units at L1 before promotion becomes available.
      const upgradedAtSold = worker.count === 0 ? (state.sold || 0) : (worker.upgradedAtSold ?? 0)
      // Per-hire roles: push a fresh L1 hire; shared-level roles: just count++.
      const nextWorker = def.perHire
        ? { ...worker, count: nextCount, hireLevels: [...(worker.hireLevels || []), 1], level: 1, upgradedAtSold }
        : { ...worker, count: nextCount, upgradedAtSold }
      let s = mkLog({
        ...state,
        money: state.money - cost,
        parts: (state.parts || 0) + giftParts,
        workers: { ...state.workers, [def.id]: nextWorker },
      }, giftParts > 0
        ? `👤 Hired ${def.label} #${nextCount}! 🎁 Starter kit: +${giftParts} parts to get them going.`
        : `👤 Hired ${def.label} #${nextCount}! (×${nextCount} total)`)
      return checkMilestones(s)
    }

    case 'UPGRADE_WORKER': {
      const def = WORKER_DEFS.find(d => d.id === action.payload)
      if (!def) return state
      const worker = state.workers[def.id]
      if (!worker || worker.count < 1) return state
      const baseLevel = workerLevel(worker)
      if (baseLevel >= 5) return state
      const gate = upgradeGate(worker, state)
      if (!gate.allowed) return mkLog(state, `🔒 ${def.label} needs ${gate.remaining} more sold at L${baseLevel} before promotion.`)
      const cost = upgradeCost(def, baseLevel)
      if (state.money < cost) return mkLog(state, `❌ Need $${cost} to upgrade ${def.label}`)
      // Per-hire: promote the lowest-level hire by 1. Shared: bump whole crew.
      let nextWorker
      if (def.perHire) {
        const idx = promotionTargetIndex(worker)
        if (idx < 0) return state
        const nextHireLevels = worker.hireLevels.map((lv, i) => i === idx ? lv + 1 : lv)
        nextWorker = { ...worker, hireLevels: nextHireLevels, level: Math.min(...nextHireLevels), upgradedAtSold: state.sold || 0 }
      } else {
        nextWorker = { ...worker, level: worker.level + 1, upgradedAtSold: state.sold || 0 }
      }
      const nextLevelLabel = def.perHire ? (baseLevel + 1) : (worker.level + 1)
      return mkLog({
        ...state,
        money: state.money - cost,
        workers: { ...state.workers, [def.id]: nextWorker },
      }, def.perHire
        ? `⬆️ Promoted a ${def.label} to Level ${nextLevelLabel}!`
        : `⬆️ ${def.label} crew upgraded to Level ${nextLevelLabel}!`)
    }

    case 'HIRE_SPECIAL': {
      const def = SPECIAL_HIRES.find(d => d.id === action.payload)
      if (!def) return state
      const cost = specialHireCost(def, state)
      if (state.money < cost) return mkLog(state, `❌ Need $${cost.toLocaleString()} to hire ${def.label}`)
      let s = mkLog({
        ...state,
        money: state.money - cost,
        specials: { ...state.specials, [def.id]: { hired: true, level: 1 } },
      }, `🎖️ Hired ${def.label}! ${def.effectLabel(1)}`)
      return checkMilestones(s)
    }

    case 'UPGRADE_SPECIAL': {
      const def = SPECIAL_HIRES.find(d => d.id === action.payload)
      if (!def) return state
      const sp = state.specials[def.id]
      if (!sp?.hired || sp.level >= def.maxLevel) return state
      const cost = specialUpgCost(def, sp.level, state)
      if (state.money < cost) return mkLog(state, `❌ Need $${cost.toLocaleString()} to upgrade ${def.label}`)
      return mkLog({
        ...state,
        money: state.money - cost,
        specials: { ...state.specials, [def.id]: { ...sp, level: sp.level + 1 } },
      }, `⬆️ ${def.label} → ${def.effectLabel(sp.level + 1)}!`)
    }

    case 'FIRE_EVENT': {
      if (state.activeEvent) return state
      const ev = DECISION_EVENTS.find(e => e.id === action.payload)
      if (!ev || !ev.condition(state)) return state
      return { ...state, activeEvent: ev.id, activeEventAt: Date.now() }
    }

    case 'ADJUST_MORALE': {
      // payload: { delta: number, msg?: string }
      const d = action.payload?.delta || 0
      if (!moraleUnlocked(state)) return state
      const next = Math.max(0, Math.min(100, (state.morale ?? 60) + d))
      if (next === state.morale) return state
      let s = { ...state, morale: next }
      if (action.payload?.msg) s = mkLog(s, action.payload.msg)
      return s
    }

    case 'MORALE_DECAY': {
      // Ticker-driven decay (~1 pt/min). Cap catch-up so AFK/closed-tab
      // returns don't nuke morale in one go — pause-on-hidden vibe.
      if (!moraleUnlocked(state)) return state
      const now = Date.now()
      const last = state.lastMoraleDecayAt || now
      const minsElapsed = (now - last) / 60_000
      if (minsElapsed < 1) return state
      const dec = Math.min(Math.floor(minsElapsed), 3)
      const next = Math.max(0, (state.morale ?? 60) - dec)
      return { ...state, morale: next, lastMoraleDecayAt: now }
    }

    case 'RUN_PAYROLL': {
      // Ticker-driven pay cycle. Unlocks at Shop. Cap catch-up to 3 cycles
      // so AFK returns don't drain the bank in one shot. Wages sum across
      // *all* shops so opening a new location adds real recurring cost.
      if (!payrollUnlocked(state)) {
        return { ...state, lastPayrollAt: Date.now() }
      }
      const now  = Date.now()
      const last = state.lastPayrollAt || now
      const cycles = Math.floor((now - last) / PAYROLL_INTERVAL_MS)
      if (cycles < 1) return state
      const payCycles = Math.min(cycles, 3)
      const due = totalWageAcrossShops(state) * payCycles
      if (due <= 0) return { ...state, lastPayrollAt: now }
      let s = { ...state, lastPayrollAt: now }
      const shopCount = (state.shops || []).length || 1
      const label = shopCount > 1 ? `Payroll (${shopCount} shops)` : 'Payroll'
      if (s.money >= due) {
        s = { ...s, money: s.money - due, totalSpent: s.totalSpent + due }
        s = bumpMorale(s, 3 * payCycles)
        s = mkLog(s, `💵 ${label}: -$${due.toLocaleString()}. Crew paid on time.`)
      } else {
        // Partial pay — take what's there, morale tanks
        const paid = Math.max(0, s.money)
        s = { ...s, money: s.money - paid, totalSpent: s.totalSpent + paid }
        s = bumpMorale(s, -15)
        s = mkLog(s, `⚠️ Missed ${label.toLowerCase()}! Needed $${due.toLocaleString()}, paid $${paid.toLocaleString()}. Crew is PISSED.`)
      }
      return s
    }

    case 'BOSS_MODE_START': {
      const now = Date.now()
      if (!bossReady(state, now)) return state
      return mkLog({
        ...state,
        bossUntil: now + BOSS_DURATION_MS,
        bossCooldownUntil: now + BOSS_DURATION_MS + BOSS_COOLDOWN_MS,
      }, `🔥 BOSS MODE! Crew is flying — +150% speed, free parts for 90s.`)
    }

    case 'ADD_BUFF': {
      // payload: { id, icon, label, durationMs, effect: { type, mult } }
      const b = action.payload
      if (!b || !b.effect) return state
      const expiresAt = Date.now() + (b.durationMs || 60_000)
      const keep = (state.buffs || []).filter(x => x.id !== b.id && x.expiresAt > Date.now())
      return { ...state, buffs: [...keep, { id: b.id, icon: b.icon, label: b.label, expiresAt, effect: b.effect }] }
    }

    case 'PRUNE_BUFFS': {
      const now = Date.now()
      const fresh = (state.buffs || []).filter(b => b.expiresAt > now)
      if (fresh.length === (state.buffs || []).length) return state
      return { ...state, buffs: fresh }
    }

    case 'SHIFT_EVENT_START': {
      if (!state.activeEvent || !state.activeEventAt) return state
      const ms = Math.max(0, action.payload || 0)
      return { ...state, activeEventAt: state.activeEventAt + ms }
    }

    case 'DISMISS_EVENT': {
      if (!state.activeEvent) return state
      const ev = DECISION_EVENTS.find(e => e.id === state.activeEvent)
      const label = ev ? `${ev.icon} ${ev.title}` : 'Event'
      return mkLog({
        ...state,
        activeEvent: null,
        activeEventAt: null,
        lastEventAt: Date.now(),
      }, `⏳ ${label} expired (no action taken).`)
    }

    case 'SET_AUTO_RESOLVE': {
      const mode = action.payload === 'greedy' ? 'greedy' : 'safe'
      return { ...state, settings: { ...(state.settings || {}), autoResolve: mode } }
    }

    case 'RESOLVE_EVENT': {
      const ev = DECISION_EVENTS.find(e => e.id === state.activeEvent)
      if (!ev) return { ...state, activeEvent: null, lastEventAt: Date.now() }
      const opt = ev.options[action.payload?.optionIndex || 0]
      if (!opt) return state
      const afterApply = opt.apply(state)
      const withCounter = {
        ...afterApply,
        counters: { ...afterApply.counters, eventsResolved: (afterApply.counters?.eventsResolved || 0) + 1 },
        activeEvent: null,
        lastEventAt: Date.now(),
      }
      return checkMilestones(withCounter)
    }

    case 'BUY_FACILITY': {
      const def = FACILITIES.find(f => f.id === action.payload)
      if (!def) return state
      if (state.facilities?.[def.id]) return state
      if (!facilityUnlocked(def, state)) return state
      if (state.money < def.cost) return mkLog(state, `❌ Need $${def.cost} for ${def.label}`)
      return mkLog({
        ...state,
        money: state.money - def.cost,
        totalSpent: state.totalSpent + def.cost,
        facilities: { ...state.facilities, [def.id]: true },
      }, `${def.icon} Installed ${def.label}! ${def.desc}`)
    }

    case 'UNLOCK_RESEARCH': {
      const def = RESEARCH.find(r => r.id === action.payload)
      if (!def) return state
      if (state.research?.[def.id]) return state
      if (!researchUnlocked(def, state)) return state
      const rep = state.reputation || 0
      if (rep < def.cost) return mkLog(state, `❌ Need ${def.cost} rep for ${def.label}`)
      let s = {
        ...state,
        reputation: rep - def.cost,
        research: { ...state.research, [def.id]: true },
      }
      s = def.apply(s)
      return mkLog(s, `🔬 Researched ${def.icon} ${def.label} — ${def.desc}`)
    }

    case 'OPEN_SHOP': {
      if (!secondShopUnlocked(state)) return mkLog(state, '🔒 Second shop unlocks at Warehouse stage.')
      if (state.money < SECOND_SHOP_COST) return mkLog(state, `❌ Need $${SECOND_SHOP_COST.toLocaleString()} to open a new shop`)
      const existing = (state.shops || []).length
      const icons = ['🏠', '🏢', '🏭', '🌉', '🌆', '🏝️']
      const newId = `shop-${existing + 1}-${Date.now().toString(36)}`
      const fresh = makeFreshShopState()
      const newEntry = {
        id: newId,
        name: `Shop #${existing + 1}`,
        icon: icons[existing % icons.length] || '🏪',
        openedAt: Date.now(),
        lastActiveAt: Date.now(),
        ...fresh,
      }
      return mkLog({
        ...state,
        money: state.money - SECOND_SHOP_COST,
        totalSpent: (state.totalSpent || 0) + SECOND_SHOP_COST,
        shops: [...(state.shops || []), newEntry],
      }, `🏗️ Opened ${newEntry.name}! Switch over from the shop selector.`)
    }

    case 'SWITCH_SHOP': {
      const targetId = action.payload
      if (!targetId || targetId === state.activeShopId) return state
      const target = (state.shops || []).find(sh => sh.id === targetId)
      if (!target) return state
      // 1. Write current active shop back to the shops list
      const activeSnap = extractShopState(state)
      const shops = (state.shops || []).map(sh => {
        if (sh.id === state.activeShopId) {
          // Strip shop-local keys from entry before stashing the snapshot
          const meta = { id: sh.id, name: sh.name, icon: sh.icon, openedAt: sh.openedAt }
          return { ...meta, ...activeSnap, lastActiveAt: Date.now() }
        }
        return sh
      })
      // 2. Load target's snapshot onto state root
      const loaded = applyShopState({ ...state, shops, activeShopId: targetId }, target)
      // 3. Clear target's snapshot fields from its entry (they're now at root)
      const meta = { id: target.id, name: target.name, icon: target.icon, openedAt: target.openedAt, lastActiveAt: target.lastActiveAt }
      const finalShops = shops.map(sh => sh.id === targetId ? meta : sh)
      return mkLog({ ...loaded, shops: finalShops }, `🔀 Switched to ${target.icon} ${target.name}`)
    }

    case 'RENAME_SHOP': {
      const { id, name } = action.payload || {}
      if (!id || !name) return state
      const shops = (state.shops || []).map(sh => sh.id === id ? { ...sh, name: String(name).slice(0, 24) } : sh)
      return { ...state, shops }
    }

    case 'PRIORITIZE_TYPE': {
      const typeId = action.payload
      if (!typeId) return state
      // Toggle: clicking the already-active priority clears it
      const isSame  = state.priorityType === typeId
      const nextKey = isSame ? null : typeId
      const reorder = arr => {
        if (!arr?.length || !nextKey) return arr
        const match = arr.filter(u => (u.type || 'laptop') === nextKey)
        const rest  = arr.filter(u => (u.type || 'laptop') !== nextKey)
        return [...match, ...rest]
      }
      return {
        ...state,
        priorityType: nextKey,
        pipeline: Object.fromEntries(Object.entries(state.pipeline).map(([k, v]) => [k, reorder(v)])),
      }
    }

    case 'SET_PRIORITY_TYPE': {
      // Non-toggling setter (used by Floor Manager auto-prioritize)
      const typeId = action.payload || null
      if (state.priorityType === typeId) return state
      const reorder = arr => {
        if (!arr?.length || !typeId) return arr
        const match = arr.filter(u => (u.type || 'laptop') === typeId)
        const rest  = arr.filter(u => (u.type || 'laptop') !== typeId)
        return [...match, ...rest]
      }
      return {
        ...state,
        priorityType: typeId,
        pipeline: Object.fromEntries(Object.entries(state.pipeline).map(([k, v]) => [k, reorder(v)])),
      }
    }

    case 'REAPPLY_PRIORITY': {
      const typeId = state.priorityType
      if (!typeId) return state
      const reorder = arr => {
        if (!arr?.length) return arr
        // Cheap check: if first non-matching type is already past all matches, skip
        const match = arr.filter(u => (u.type || 'laptop') === typeId)
        if (match.length === 0 || match.length === arr.length) return arr
        const rest = arr.filter(u => (u.type || 'laptop') !== typeId)
        return [...match, ...rest]
      }
      return {
        ...state,
        pipeline: Object.fromEntries(Object.entries(state.pipeline).map(([k, v]) => [k, reorder(v)])),
      }
    }

    case 'ACCEPT_CONTRACT': {
      const list = activeContractsList(state)
      const cap = maxConcurrentContracts(state)
      if (list.length >= cap) return mkLog(state, `❌ Contract slots full (${cap}). Upgrade Sales Manager for more.`)
      const tpl = CONTRACT_TEMPLATES.find(c => c.id === action.payload)
      if (!tpl) return state
      if (!contractUnlocked(tpl, state)) return state
      if (list.some(c => c.id === tpl.id)) return mkLog(state, `❌ Already have an active ${tpl.label} contract.`)
      const scaled = scaledContract(tpl, state)
      if (state.money < scaled.deposit) return mkLog(state, `❌ Need $${scaled.deposit.toLocaleString()} deposit for ${tpl.label}`)
      const startingCounts = { ...(state.counters?.typeSoldCount || {}) }
      const newContract = {
        id: tpl.id,
        acceptedAt: Date.now(),
        startingCounts,
        required: scaled.required,
        reward:   scaled.reward,
        deposit:  scaled.deposit,
      }
      return mkLog({
        ...state,
        money: state.money - scaled.deposit,
        totalSpent: state.totalSpent + scaled.deposit,
        activeContract: null,
        activeContracts: [...list, newContract],
      }, `📝 Accepted contract: ${tpl.icon} ${tpl.label} — deposit $${scaled.deposit.toLocaleString()}, reward $${scaled.reward.toLocaleString()}${scaled.mult > 1.01 ? ` (${scaled.mult.toFixed(1)}× base)` : ''}`)
    }

    case 'COMPLETE_CONTRACT': {
      const list = activeContractsList(state)
      if (list.length === 0) return state
      const id  = action.payload ?? list[0].id
      const ac  = list.find(c => c.id === id)
      if (!ac) return state
      const tpl = CONTRACT_TEMPLATES.find(c => c.id === ac.id)
      const nextList = list.filter(c => c !== ac)
      if (!tpl) return { ...state, activeContract: null, activeContracts: nextList }
      const reward  = ac.reward  ?? tpl.reward
      const deposit = ac.deposit ?? tpl.deposit
      const rewardMult = state.bonuses?.contractRewardMult || 1
      const boostedReward = Math.round(reward * rewardMult)
      const payout = boostedReward + deposit
      const doubleDipNow = nextList.some(other => contractAllMet(state, other))
      const msLeft = contractTimeLeft(state, ac)
      const clutchNow = msLeft > 0 && msLeft <= 5000
      const repGain = contractRepAward(state)
      let s = mkLog({
        ...state,
        money: state.money + payout,
        totalEarned: state.totalEarned + payout,
        reputation: (state.reputation || 0) + repGain,
        activeContract: null,
        activeContracts: nextList,
        counters: {
          ...state.counters,
          contractsDone: (state.counters?.contractsDone || 0) + 1,
          doubleDipTriggered: state.counters?.doubleDipTriggered || doubleDipNow,
          clutchShipTriggered: state.counters?.clutchShipTriggered || clutchNow,
        },
      }, `✅ Contract fulfilled: ${tpl.icon} ${tpl.label} — +$${boostedReward.toLocaleString()} reward (+$${deposit.toLocaleString()} deposit back) · +${repGain} rep`)
      if (clutchNow) s = mkLog(s, `⏱️ Buzzer-beater! Shipped with ${(msLeft / 1000).toFixed(1)}s left.`)
      return checkMilestones(s)
    }

    case 'FAIL_CONTRACT': {
      const list = activeContractsList(state)
      if (list.length === 0) return state
      const id  = action.payload ?? list[0].id
      const ac  = list.find(c => c.id === id)
      if (!ac) return state
      const tpl = CONTRACT_TEMPLATES.find(c => c.id === ac.id)
      const deposit = ac.deposit ?? tpl?.deposit ?? 0
      const refund = tpl && !contractFulfillable(tpl, state)
      const depositBack = refund ? deposit : 0
      const nextList = list.filter(c => c !== ac)
      return mkLog({
        ...state,
        money: state.money + depositBack,
        activeContract: null,
        activeContracts: nextList,
        counters: { ...state.counters, contractsFailed: (state.counters?.contractsFailed || 0) + 1 },
      }, refund
        ? `↩️ Contract voided: ${tpl.icon} ${tpl.label} — unfulfillable, deposit refunded ($${deposit.toLocaleString()}).`
        : `❌ Contract failed: ${tpl ? tpl.icon + ' ' + tpl.label : 'unknown'} — deposit forfeit.`)
    }

    case 'CLAIM_MILESTONE':
      return claimMilestone(state, action.payload)

    case 'SET_LANG':
      return { ...state, lang: action.payload === 'es' ? 'es' : 'en' }

    case 'SET_AUTO_SHIP':
      return { ...state, autoShip: !!action.payload }

    case 'GAME_OVER':
      if (state.gameOver) return state
      return mkLog({ ...state, gameOver: { at: Date.now() } }, '💀 BANKRUPT. Game over.')

    case 'RESET':
      return makeInitialState()

    case 'LOAD_STATE':
      return mkLog(action.payload, '📥 Save loaded.')

    default:
      return state
  }
}
