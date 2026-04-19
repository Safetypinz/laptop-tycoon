let _uid = Date.now()
function uid() { return _uid++ }
function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a }

// ── Suppliers ─────────────────────────────────────────────────────────────────

export const SUPPLIERS = [
  {
    id: 'local',
    label: 'Local Dealer',
    icon: '🏠',
    desc: 'Reliable quality. Higher prices.',
    priceMult: 1.4,
    quality: { good: 0.35, fair: 0.50, bad: 0.15 },
    stars: 3,
    events: [],
  },
  {
    id: 'wholesale',
    label: 'Wholesale',
    icon: '🚢',
    desc: 'Standard mix. Standard prices.',
    priceMult: 1.0,
    quality: { good: 0.15, fair: 0.45, bad: 0.40 },
    stars: 2,
    events: [],
  },
  {
    id: 'shenzhen',
    label: 'Shenzhen Special',
    icon: '🐉',
    desc: 'Dirt cheap. Mostly junk. Occasionally amazing.',
    priceMult: 0.60,
    quality: { good: 0.05, fair: 0.20, bad: 0.75 },
    stars: 1,
    events: [
      { chance: 0.20, msg: '🚢 "Tested working." Sure they are.' },
      { chance: 0.12, msg: '📦 Customs held the shipment. Classic.' },
      { chance: 0.05, msg: '💎 Hidden gem spotted in this batch!' },
    ],
  },
]

// ── Laptop factory ────────────────────────────────────────────────────────────

export function createLaptop(supplier = SUPPLIERS[1]) {
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

  return {
    id: uid(),
    quality,
    buyPrice: Math.max(2, Math.round(buyPrice * supplier.priceMult)),
    sellPrice: sellBase,
    repairBonusMs: 0,
    imageBonusMs: 0,
  }
}

export const QUALITY_INFO = {
  good: { label: 'Good', color: '#4caf50' },
  fair: { label: 'Fair', color: '#ff9800' },
  bad:  { label: 'Bad',  color: '#ef5350' },
}

// ── Timings ───────────────────────────────────────────────────────────────────

export const DURATIONS = {
  audit:  2000,
  repair: 5000,
  clean:  2000,
  image:  4000,
  pack:   2000,
  ship:    800,
}

// ── Random events ─────────────────────────────────────────────────────────────

const SKIP_REPAIR_CHANCE = { good: 0.90, fair: 0.50, bad: 0.05 }

const SKIP_REPAIR_MSG = {
  good: '✅ No issues found — skipping repair.',
  fair: '✅ Passes inspection — skipping repair.',
  bad:  '🍀 Lucky one — no issues found, skipping repair.',
}

const AUDIT_EVENTS = [
  { chances: { good: 0.04, fair: 0.15, bad: 0.35 }, msg: '💀 Liquid damage found! Repair will take longer.', repairBonusMs: 3000, sellMod: 0.85 },
  { chances: { good: 0.15, fair: 0.05, bad: 0.01 }, msg: '💎 High-end unit! +80% sell value.',               sellMod: 1.8 },
  { chances: { good: 0.40, fair: 0.10, bad: 0.02 }, msg: '✨ Surprisingly clean inside. Sell bonus.',         sellMod: 1.1 },
  { chances: { good: 0.02, fair: 0.05, bad: 0.12 }, msg: '🐛 Corrupted BIOS. Imaging will take longer.',     imageBonusMs: 2000 },
]

const REPAIR_EVENTS = [
  { chance: 0.07, msg: '🤦 Tech made it WORSE. Unit scrapped.',          scrapped: true },
  { chance: 0.12, msg: '📦 China parts delayed. -10% sell value.',        sellMod: 0.90 },
  { chance: 0.10, msg: '⚡ Clean repair! Sell bonus.',                    sellMod: 1.05 },
  { chance: 0.06, msg: '🔩 Missing screw. Held together with hope.',     sellMod: 0.95 },
]

export function rollAuditEvents(quality) {
  const r = { msgs: [], sellMod: 1, repairBonusMs: 0, imageBonusMs: 0, skipRepair: false }

  if (Math.random() < SKIP_REPAIR_CHANCE[quality]) {
    r.skipRepair = true
    r.msgs.push(SKIP_REPAIR_MSG[quality])
  }

  for (const ev of AUDIT_EVENTS) {
    if (Math.random() < ev.chances[quality]) {
      r.msgs.push(ev.msg)
      if (ev.sellMod)       r.sellMod       *= ev.sellMod
      if (ev.repairBonusMs) r.repairBonusMs += ev.repairBonusMs
      if (ev.imageBonusMs)  r.imageBonusMs  += ev.imageBonusMs
    }
  }

  // Liquid damage overrides the quality-based skip
  if (r.repairBonusMs > 0) r.skipRepair = false

  return r
}

export function rollRepairEvents(hasInventoryManager = false) {
  const r = { msgs: [], sellMod: 1, scrapped: false }
  const chanceMult = hasInventoryManager ? 0.2 : 1  // 80% reduction in bad events
  for (const ev of REPAIR_EVENTS) {
    if (Math.random() < ev.chance * chanceMult) {
      r.msgs.push(ev.msg)
      if (ev.sellMod)  r.sellMod  *= ev.sellMod
      if (ev.scrapped) r.scrapped  = true
    }
  }
  return r
}

// ── Workers ───────────────────────────────────────────────────────────────────

export const WORKER_DEFS = [
  { id: 'auditor', label: 'Auditor',  icon: '🔍', input: 'unchecked', actionType: 'COMPLETE_AUDIT',  hireCost: 75,  upgBase: 60,  baseDuration: DURATIONS.audit,  desc: 'Inspects incoming units' },
  { id: 'tech',    label: 'Tech',     icon: '🔧', input: 'audited',   actionType: 'COMPLETE_REPAIR', hireCost: 150, upgBase: 120, baseDuration: DURATIONS.repair, desc: 'Repairs damaged units' },
  { id: 'imager',  label: 'Imager',   icon: '💿', input: 'repaired',  actionType: 'COMPLETE_IMAGE',  hireCost: 100, upgBase: 80,  baseDuration: DURATIONS.image,  desc: 'Installs OS & software' },
  { id: 'cleaner', label: 'Cleaner',  icon: '🧹', input: 'imaged',    actionType: 'COMPLETE_CLEAN',  hireCost: 75,  upgBase: 50,  baseDuration: DURATIONS.clean,  desc: 'Cleans & preps units' },
  { id: 'packer',  label: 'Packer',   icon: '📦', input: 'cleaned',   actionType: 'COMPLETE_PACK',   hireCost: 60,  upgBase: 40,  baseDuration: DURATIONS.pack,   desc: 'Packs units for shipping' },
]

export function upgradeCost(def, currentLevel) {
  if (currentLevel >= 5) return null
  return Math.round(def.upgBase * currentLevel * 1.6)
}

// Level 1 = base speed, Level 5 = 3.5x faster
export function workerDuration(baseDuration, level) {
  const mult = [1.0, 0.75, 0.55, 0.40, 0.28]
  return Math.round(baseDuration * (mult[level - 1] || 0.28))
}

// ── Special hires (management) ───────────────────────────────────────────────

export const SPECIAL_HIRES = [
  {
    id: 'manager',
    label: 'Floor Manager',
    icon: '🧑‍💼',
    desc: 'Boosts ALL worker speed globally.',
    hireCost: 500,
    upgBase: 600,
    maxLevel: 3,
    unlockStage: 'shop',
    effectLabel: lvl => ['2× all workers', '5× all workers', '10× all workers'][lvl - 1],
  },
  {
    id: 'inventory',
    label: 'Inventory Manager',
    icon: '💻',
    desc: 'Tracks parts. Eliminates delays & cuts scrap rate by 80%.',
    hireCost: 750,
    upgBase: 0,
    maxLevel: 1,
    unlockStage: 'shop',
    effectLabel: () => 'No delays · -80% scraps',
  },
  {
    id: 'sales',
    label: 'Sales Manager',
    icon: '📈',
    desc: 'Negotiates better prices on every sale.',
    hireCost: 600,
    upgBase: 500,
    maxLevel: 3,
    unlockStage: 'warehouse',
    effectLabel: lvl => ['+10% sell price', '+20% sell price', '+30% sell price'][lvl - 1],
  },
  {
    id: 'buyer',
    label: 'Purchasing Agent',
    icon: '🤝',
    desc: 'Cuts deals on bulk lot purchases.',
    hireCost: 400,
    upgBase: 350,
    maxLevel: 2,
    unlockStage: 'shop',
    effectLabel: lvl => ['+10% lot discount', '+20% lot discount'][lvl - 1],
  },
]

export function specialUpgCost(def, currentLevel) {
  if (currentLevel >= def.maxLevel) return null
  return Math.round(def.upgBase * currentLevel * 1.8)
}

// Global speed multiplier from Floor Manager
export function globalSpeedMult(state) {
  const m = state.specials?.manager
  if (!m?.hired) return 1
  return [2, 5, 10][m.level - 1] || 1
}

// Sales bonus multiplier (Sales Manager + milestone bonuses)
export function salesBonusMult(state) {
  const s = state.specials?.sales
  const salesMult = s?.hired ? ([1.10, 1.20, 1.30][s.level - 1] || 1) : 1
  return salesMult * (1 + (state.bonuses?.sell || 0))
}

// Extra lot discount from purchasing agent
export function agentLotDiscount(state) {
  const a = state.specials?.buyer
  if (!a?.hired) return 0
  return [0.10, 0.20][a.level - 1] || 0
}

// ── Expansion stages ──────────────────────────────────────────────────────────

export const EXPANSION_STAGES = [
  { id: 'garage',    label: 'Home Garage', icon: '🏠', soldNeeded: 0,   lots: [1]          },
  { id: 'shop',      label: 'Small Shop',  icon: '🏪', soldNeeded: 25,  lots: [1, 5, 10]   },
  { id: 'warehouse', label: 'Warehouse',   icon: '🏭', soldNeeded: 100, lots: [1, 10, 20]  },
  { id: 'company',   label: 'Company',     icon: '🏢', soldNeeded: 500, lots: [1, 20, 50]  },
]

// Discount per lot size
export const LOT_DISCOUNT = { 1: 0, 5: 0.20, 10: 0.30, 20: 0.40, 50: 0.50 }

export function currentExpansion(state) {
  return EXPANSION_STAGES.find(s => s.id === state.expansionStage) || EXPANSION_STAGES[0]
}

export function nextExpansion(state) {
  const idx = EXPANSION_STAGES.findIndex(s => s.id === state.expansionStage)
  return EXPANSION_STAGES[idx + 1] || null
}

// ── Milestones ────────────────────────────────────────────────────────────────

// Internal reward helpers (operate on state, return new state)
function mCash(s, n)         { return mkLog({ ...s, money: s.money + n }, `💵 Reward: +$${n}`) }
function mSell(s, pct)       { return { ...s, bonuses: { ...s.bonuses, sell:         (s.bonuses?.sell         || 0) + pct  } } }
function mScrap(s, mult)     { return { ...s, bonuses: { ...s.bonuses, scrapMult:    (s.bonuses?.scrapMult    || 1) * mult } } }
function mHireCost(s, mult)  { return { ...s, bonuses: { ...s.bonuses, hireCostMult: (s.bonuses?.hireCostMult || 1) * mult } } }
function mLotDisc(s, pct)    { return { ...s, bonuses: { ...s.bonuses, lotDisc:      (s.bonuses?.lotDisc      || 0) + pct  } } }
function mUnlock(s, feat)    { return { ...s, features: { ...s.features, [feat]: true } } }

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
  { id: 'first_hire',     icon: '👤', label: 'First Hire',        desc: 'Hire your first worker',            rewardDesc: '+$50',                    progress: null, check: s => Object.values(s.workers).some(w => w.hired),                                                                            reward: s => mCash(s, 50) },
  { id: 'full_crew',      icon: '👥', label: 'Full Crew',         desc: 'Hire all 5 pipeline workers',       rewardDesc: '+$200 · -10% hire costs', progress: s => ({ cur: Object.values(s.workers).filter(w => w.hired).length, max: 5 }), check: s => Object.values(s.workers).every(w => w.hired), reward: s => mHireCost(mCash(s, 200), 0.9) },
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
]

export function checkMilestones(state) {
  let s = state
  for (const m of MILESTONES) {
    if (s.earned.includes(m.id)) continue
    if (!m.check(s)) continue
    s = { ...s, earned: [...s.earned, m.id] }
    s = mkLog(s, `🏅 MILESTONE UNLOCKED: ${m.icon} ${m.label} — ${m.rewardDesc}`)
    s = m.reward(s)
  }
  return s
}

// ── State ─────────────────────────────────────────────────────────────────────

export function makeInitialState() {
  return {
    money: 100,
    pipeline: { unchecked: [], audited: [], repaired: [], cleaned: [], imaged: [], packed: [] },
    workers: Object.fromEntries(WORKER_DEFS.map(d => [d.id, { hired: false, level: 1 }])),
    specials: Object.fromEntries(SPECIAL_HIRES.map(d => [d.id, { hired: false, level: 1 }])),
    expansionStage: 'garage',
    activeSupplier: 'wholesale',
    sold: 0,
    totalEarned: 0,
    totalSpent: 0,
    bestProfit: 0,
    earned: [],
    bonuses: { sell: 0, hireCostMult: 1, lotDisc: 0, scrapMult: 1 },
    counters: { shenzhenBought: 0, lotsTotal: 0, bigLotPurchased: false, noScrapStreak: 0, highValueSold: false, diamondFound: false, biggestBatch: 0 },
    features: { hiddenGems: false },
    log: [],
  }
}

// ── Reducer ───────────────────────────────────────────────────────────────────

function mkLog(state, msg) {
  const entry = { id: uid(), msg, t: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
  return { ...state, log: [entry, ...state.log].slice(0, 60) }
}

export function reducer(state, action) {
  const p = state.pipeline

  switch (action.type) {

    case 'SET_SUPPLIER':
      return { ...state, activeSupplier: action.payload }

    case 'BUY': {
      const sup    = SUPPLIERS.find(s => s.id === state.activeSupplier) || SUPPLIERS[1]
      const laptop = createLaptop(sup)
      if (state.money < laptop.buyPrice) return mkLog(state, '❌ Not enough cash!')
      const ctr = state.counters
      const newCounters = sup.id === 'shenzhen'
        ? { ...ctr, shenzhenBought: (ctr?.shenzhenBought || 0) + 1 }
        : ctr
      let s = mkLog({
        ...state,
        money: state.money - laptop.buyPrice,
        totalSpent: state.totalSpent + laptop.buyPrice,
        pipeline: { ...p, unchecked: [...p.unchecked, laptop] },
        counters: newCounters,
      }, `🛒 [${sup.icon}] Bought ${laptop.quality} laptop · paid $${laptop.buyPrice} · est. $${laptop.sellPrice}`)
      return checkMilestones(s)
    }

    case 'BUY_LOT': {
      const sup      = SUPPLIERS.find(s => s.id === state.activeSupplier) || SUPPLIERS[1]
      const qty      = action.payload
      const discount = LOT_DISCOUNT[qty] || 0
      const laptops  = Array.from({ length: qty }, () => createLaptop(sup))
      const totalDiscount = Math.min(0.75, discount + agentLotDiscount(state) + (state.bonuses?.lotDisc || 0))
      const total    = Math.round(laptops.reduce((s, l) => s + l.buyPrice, 0) * (1 - totalDiscount))
      if (state.money < total) return mkLog(state, `❌ Need $${total} for a lot of ${qty}`)
      const perUnit  = Math.round(total / qty)
      const ctr      = state.counters
      const newCounters = {
        ...ctr,
        lotsTotal:       (ctr?.lotsTotal || 0) + 1,
        bigLotPurchased: (ctr?.bigLotPurchased || false) || qty >= 20,
        shenzhenBought:  (ctr?.shenzhenBought || 0) + (sup.id === 'shenzhen' ? qty : 0),
      }
      let s = mkLog({
        ...state,
        money: state.money - total,
        totalSpent: state.totalSpent + total,
        pipeline: { ...p, unchecked: [...p.unchecked, ...laptops] },
        counters: newCounters,
      }, `📦 [${sup.icon}] Lot ×${qty} · paid $${total} · ~$${perUnit}/unit (${Math.round(totalDiscount * 100)}% off)`)
      for (const ev of sup.events) {
        if (Math.random() < ev.chance) s = mkLog(s, ev.msg)
      }
      return checkMilestones(s)
    }

    case 'COMPLETE_AUDIT': {
      const ev = action.payload
      const laptop = p.unchecked[0]
      if (!laptop) return state
      const updated = {
        ...laptop,
        sellPrice: Math.round(laptop.sellPrice * ev.sellMod),
        repairBonusMs: ev.repairBonusMs,
        imageBonusMs: ev.imageBonusMs,
      }
      let np = { ...p, unchecked: p.unchecked.slice(1) }
      np = ev.skipRepair
        ? { ...np, repaired: [...np.repaired, updated] }
        : { ...np, audited: [...np.audited, updated] }
      let s = { ...state, pipeline: np }
      for (const m of ev.msgs) s = mkLog(s, m)
      if (!ev.msgs.length) s = mkLog(s, `🔍 Audit done · ${laptop.quality} · est. $${updated.sellPrice}`)
      return s
    }

    case 'COMPLETE_REPAIR': {
      const ev = action.payload
      const laptop = p.audited[0]
      if (!laptop) return state
      let np = { ...p, audited: p.audited.slice(1) }
      if (!ev.scrapped) {
        const updated = { ...laptop, sellPrice: Math.round(laptop.sellPrice * ev.sellMod) }
        np = { ...np, repaired: [...np.repaired, updated] }
      }
      const noScrapStreak = ev.scrapped ? 0 : (state.counters?.noScrapStreak || 0) + 1
      let s = { ...state, pipeline: np, counters: { ...state.counters, noScrapStreak } }
      for (const m of ev.msgs) s = mkLog(s, m)
      if (!ev.msgs.length) s = mkLog(s, '🔧 Repair complete.')
      return checkMilestones(s)
    }

    case 'COMPLETE_IMAGE': {
      const laptop = p.repaired[0]
      if (!laptop) return state
      return mkLog({ ...state, pipeline: { ...p, repaired: p.repaired.slice(1), imaged: [...p.imaged, laptop] } }, '💿 Imaging done.')
    }

    case 'COMPLETE_CLEAN': {
      const laptop = p.imaged[0]
      if (!laptop) return state
      return mkLog({ ...state, pipeline: { ...p, imaged: p.imaged.slice(1), cleaned: [...p.cleaned, laptop] } }, '🧹 Cleaning done.')
    }

    case 'COMPLETE_PACK': {
      const laptop = p.cleaned[0]
      if (!laptop) return state
      return mkLog({ ...state, pipeline: { ...p, cleaned: p.cleaned.slice(1), packed: [...p.packed, laptop] } }, '📦 Packed and ready to ship.')
    }

    case 'COMPLETE_SHIP': {
      const laptop    = p.packed[0]
      if (!laptop) return state
      const finalPrice = Math.round(laptop.sellPrice * salesBonusMult(state))
      const profit     = finalPrice - laptop.buyPrice
      const newSold    = state.sold + 1
      const newCounters = {
        ...state.counters,
        highValueSold: (state.counters?.highValueSold || false) || finalPrice >= 80,
      }
      let s = mkLog({
        ...state,
        money: state.money + finalPrice,
        sold: newSold,
        totalEarned: state.totalEarned + finalPrice,
        bestProfit: Math.max(state.bestProfit, profit),
        pipeline: { ...p, packed: p.packed.slice(1) },
        counters: newCounters,
      }, `🚚 Shipped for $${finalPrice} · profit ${profit >= 0 ? '+' : ''}$${profit}`)

      const next = nextExpansion(s)
      if (next && newSold >= next.soldNeeded) {
        s = mkLog({ ...s, expansionStage: next.id },
          `🎉 UPGRADED to ${next.label}! Lot buying unlocked: ${next.lots.filter(n => n > 1).join(', ')} units.`)
      }
      return checkMilestones(s)
    }

    case 'BULK_SHIP': {
      const laptops = p.packed
      if (!laptops.length) return state
      let totalRevenue = 0, totalProfit = 0, highValue = state.counters?.highValueSold || false
      for (const laptop of laptops) {
        const fp = Math.round(laptop.sellPrice * salesBonusMult(state))
        totalRevenue += fp
        totalProfit  += fp - laptop.buyPrice
        if (fp >= 80) highValue = true
      }
      const newSold    = state.sold + laptops.length
      const bestProfit = laptops.reduce((best, l) => {
        const fp = Math.round(l.sellPrice * salesBonusMult(state))
        return Math.max(best, fp - l.buyPrice)
      }, state.bestProfit)
      let s = mkLog({
        ...state,
        money:       state.money + totalRevenue,
        sold:        newSold,
        totalEarned: state.totalEarned + totalRevenue,
        bestProfit,
        pipeline:    { ...p, packed: [] },
        counters: {
          ...state.counters,
          highValueSold: highValue,
          biggestBatch:  Math.max(state.counters?.biggestBatch || 0, laptops.length),
        },
      }, laptops.length === 1
        ? `🚚 Shipped for $${totalRevenue} · profit ${totalProfit >= 0 ? '+' : ''}$${totalProfit}`
        : `🚀 Bulk shipped ×${laptops.length} · $${totalRevenue} revenue · ${totalProfit >= 0 ? '+' : ''}$${totalProfit} profit`)
      const next = nextExpansion(s)
      if (next && newSold >= next.soldNeeded) {
        s = mkLog({ ...s, expansionStage: next.id },
          `🎉 UPGRADED to ${next.label}! Lot buying unlocked: ${next.lots.filter(n => n > 1).join(', ')} units.`)
      }
      return checkMilestones(s)
    }

    case 'HIRE_WORKER': {
      const def  = WORKER_DEFS.find(d => d.id === action.payload)
      if (!def) return state
      const cost = Math.round(def.hireCost * (state.bonuses?.hireCostMult || 1))
      if (state.money < cost) return mkLog(state, `❌ Need $${cost} to hire ${def.label}`)
      let s = mkLog({
        ...state,
        money: state.money - cost,
        workers: { ...state.workers, [def.id]: { hired: true, level: 1 } },
      }, `👤 Hired ${def.label}! They'll work automatically.`)
      return checkMilestones(s)
    }

    case 'UPGRADE_WORKER': {
      const def = WORKER_DEFS.find(d => d.id === action.payload)
      if (!def) return state
      const worker = state.workers[def.id]
      if (!worker?.hired || worker.level >= 5) return state
      const cost = upgradeCost(def, worker.level)
      if (state.money < cost) return mkLog(state, `❌ Need $${cost} to upgrade ${def.label}`)
      return mkLog({
        ...state,
        money: state.money - cost,
        workers: { ...state.workers, [def.id]: { ...worker, level: worker.level + 1 } },
      }, `⬆️ ${def.label} upgraded to Level ${worker.level + 1}!`)
    }

    case 'HIRE_SPECIAL': {
      const def = SPECIAL_HIRES.find(d => d.id === action.payload)
      if (!def) return state
      if (state.money < def.hireCost) return mkLog(state, `❌ Need $${def.hireCost} to hire ${def.label}`)
      let s = mkLog({
        ...state,
        money: state.money - def.hireCost,
        specials: { ...state.specials, [def.id]: { hired: true, level: 1 } },
      }, `🎖️ Hired ${def.label}! ${def.effectLabel(1)}`)
      return checkMilestones(s)
    }

    case 'UPGRADE_SPECIAL': {
      const def = SPECIAL_HIRES.find(d => d.id === action.payload)
      if (!def) return state
      const sp = state.specials[def.id]
      if (!sp?.hired || sp.level >= def.maxLevel) return state
      const cost = specialUpgCost(def, sp.level)
      if (state.money < cost) return mkLog(state, `❌ Need $${cost} to upgrade ${def.label}`)
      return mkLog({
        ...state,
        money: state.money - cost,
        specials: { ...state.specials, [def.id]: { ...sp, level: sp.level + 1 } },
      }, `⬆️ ${def.label} → ${def.effectLabel(sp.level + 1)}!`)
    }

    case 'RESET':
      return makeInitialState()

    default:
      return state
  }
}
