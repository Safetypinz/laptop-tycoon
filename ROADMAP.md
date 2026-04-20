# Laptop Refurb Tycoon — Roadmap

Game is **endless** — progression keeps unlocking new stuff past Company.

## Near-term (building now)

### 1. Sales Channels
Sell-side counterpart to suppliers. Each channel has a price mult + fee + unlock req.

| Channel | Mult | Fee | Unlock |
|---|---|---|---|
| eBay | 1.00× | 13% | default |
| Amazon | 1.25× | 18% | 50 sold |
| Woot | 0.85× | 5% | 200 sold |
| Wholesale Contracts | 0.75× | 0% | Company stage |

Channel selector in Actions tab. Locked channels show as teasers with unlock req.

### 2. Stages past Company (endless tail)
Current: Garage → Shop (25) → Warehouse (100) → Company (500).
Add: **Regional (2,000) → National (10,000) → Corporate (50,000+)**.
Each unlocks bigger lots, a new channel, and/or new device types.

### 3. Facility upgrades (Shop additions)
Standalone one-time or leveled purchases, each adds a passive effect or unlocks a pipeline branch.

- **Paint booth** — +% sell on cosmetic-damaged units (reclaim "bad" quality)
- **Vinyl cutter** — custom branding; unlocks Amazon "prime" premium tier
- **Testing rig** — reduces bad-event chance at audit
- **Battery station** — adds "refurbished battery" tag, +sell on laptops
- **Diagnostic lab** — auto-upgrades "fair" → "good" at some chance
- **Photo studio** — +% sell on eBay/Amazon (better listings)

### 4. Device types (late-game variety)
Gate at Regional stage or later — variety as reward, not baseline.

- **Laptop** (baseline)
- **Desktop** (higher price + repair time, fatter margin)
- **Tablet** (lower price, faster repair, volume play)
- **Monitor** (cheapest, fastest, grind units)
- **Phone** (small, quick, high-fee channel premium)
- **AIO** (All-in-One — hybrid of laptop + desktop)

Each type has priceMult / sellMult / repairMult. Supplier type mix changes by stage so higher stages naturally bring variety.

## Later ideas (not scoped yet)

### Decision events (Reigns / "Yes Sir" style)
Random pop-up offers with uncertain outcomes. Player picks Yes/No, sometimes good, sometimes bad. Adds flavor + risk management.

Examples:
- **Sketchy salesman** — "$200 for a pallet, sight unseen." Maybe diamonds, maybe bricks.
- **Verified Amazon seller badge** — $500 now for +X% sell, Y% chance of rejection
- **Tech school intern program** — free labor for 3 days, small chance intern breaks a unit
- **Dell B2B contract offer** — commit to buying 100 units next month at steep discount; penalty if you can't afford
- **Employee raise request** — yes: morale/speed bump, no: worker quits
- **IRS audit** — pay fees now or risk larger hit later
- **Customs seizure** — pay bribe to release Shenzhen shipment or lose it
- **Craigslist haul** — $400 for a pile of unknowns, could be 5 good units or 5 monitors
- **Angry customer** — refund or fight it (reputation vs cash)
- **Local news feature** — spend $ on interview prep for sales boost, or skip

Mechanic: event fires randomly (based on conditions like cash threshold, time since last), modal pops up, player clicks Yes/No, outcome rolled from weighted possibilities.

### Other later ideas
- **Stats page** — units/hr per worker, revenue over time, channel breakdown
- **Quest system** — channels/facilities unlock via quests, not just sold count
- **Prestige loop** — reset to Garage for permanent bonuses (multiplier on everything)
- **Events/Seasons** — holiday sales, supplier fire-sales, tax season
- **Staff attributes** — named workers with traits (fast/careful/cheap)
- **Save import/export** — move saves between machines via USB ✓ DONE
- **Action queue** — click manual actions while one is running, they chain ✓ DONE
- **Capacitor wrap** — Android/iOS/desktop packaging
