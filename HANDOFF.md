# Laptop Refurb Tycoon — Dev Handoff

## Last worked on
Balance tuning, pipeline label fixes, level-up overlay, milestone system, bulk ship.

## What's built and working
- Full pipeline: Incoming → Audit → To Repair → To Image → To Clean → To Pack → Ready → Ship
- 3 suppliers (Local, Wholesale, Shenzhen) with quality distributions and random events
- Quality-based repair skipping (good=90%, fair=50%, bad=5%)
- Liquid damage event overrides the skip
- 5 auto-workers (Auditor, Tech, Imager, Cleaner, Packer) — hire + 5 upgrade levels each
- 4 management hires (Floor Manager, Inventory Mgr, Sales Mgr, Purchasing Agent)
- Lot buying with bulk discounts, purchasing agent bonus stacks
- Expansion stages: Garage → Shop (25) → Warehouse (100) → Company (500)
- Full-screen level-up overlay with animation when stage changes
- 16 milestones with permanent rewards (cash, sell %, scrap reduction, hire discounts)
- Milestones tab with progress bars, badge flashes when new ones earned
- Bulk ship — one click ships all packed units, BULK_SHIP action in reducer
- `big_shipment` milestone: ship 10 at once → +$300 + 5% sales
- Auto-save to localStorage (key: `lrt-v2`)
- Pipeline arrows (›) between stages so flow direction is obvious

## Key files
- `src/game.js` — all game logic: suppliers, workers, specials, milestones, reducer
- `src/App.jsx` — all UI: tabs (Actions / Shop / Milestones), worker ticker, pipeline display
- `src/App.css` — dark theme styles

## Architecture notes
- `useReducer` for game state, pure reducer in game.js
- `stateRef` pattern — ref updated every render so worker ticker (setInterval) never has stale closures
- `workerBusy` ref prevents double-processing by auto workers
- Worker ticker runs every 500ms, reads stateRef, fires setTimeout per worker
- `checkMilestones(state)` called at end of: BUY, BUY_LOT, COMPLETE_REPAIR, COMPLETE_SHIP, BULK_SHIP, HIRE_WORKER, HIRE_SPECIAL
- `loadState()` merges saved + fresh state so new fields don't break old saves

## Known issues / things to tune
- Balance pass not done yet — prices, hire costs, upgrade costs, sell prices need a full playthrough to validate
- `hireCostMult` bonus (from full_crew milestone) applies in reducer but hire button still shows base price — display bug, low priority

## What's next (priority order)
1. **Balance pass** — play garage to company, report what felt too slow/cheap/easy
2. **Sales channels** — eBay → Amazon → Woot → Wholesale contracts (quest-gated)
3. **Stats page** — units/hr per worker, revenue over time, supplier breakdown
4. **Device types** — desktops, tablets, monitors
5. **Capacitor wrap** — Android/iOS/desktop packaging

## Repo
`Safetypinz/laptop-tycoon` (private)

## Save data
Lives in browser localStorage — does NOT transfer between machines. Start fresh on new machine.
