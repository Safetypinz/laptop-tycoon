# Laptop Refurb Tycoon

An idle/clicker business simulation game about buying, refurbishing, and selling laptops. Built in React — Capacitor wrap for Android/iOS/desktop planned.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`

## How to Play

Buy laptops from suppliers, run them through the refurb pipeline, ship them for profit. Hire workers to automate each stage. Expand from a home garage to a full company.

### Pipeline
**Incoming → Audit → To Repair → To Image → To Clean → To Pack → Ready → Ship**

- Units that pass inspection skip the repair stage automatically
- Good quality units skip repair ~90% of the time
- Shenzhen units are cheap but almost everything needs repair

### Suppliers
| Supplier | Price | Quality |
|---|---|---|
| Local Dealer | +40% | Mostly good — high skip rate |
| Wholesale | Standard | Mixed bag |
| Shenzhen Special | -40% | Mostly junk, occasionally amazing |

### Workers (hire + upgrade in Shop tab)
- **Auditor** — inspects incoming units
- **Tech** — repairs damaged units (slowest step)
- **Imager** — installs OS & software
- **Cleaner** — cleans & preps units
- **Packer** — packs for shipping

### Management (unlocks with expansion)
- **Floor Manager** — 2x/5x/10x all worker speed
- **Inventory Manager** — eliminates scrap & delays
- **Sales Manager** — +10/20/30% sell price
- **Purchasing Agent** — bulk lot discounts

### Expansion Stages
Garage (start) → Small Shop (25 sold) → Warehouse (100 sold) → Company (500 sold)

## Features
- 3 suppliers with quality distributions and random events
- Quality-based repair skipping
- Lot buying with bulk discounts (up to 50% off)
- 16 milestones with permanent rewards
- Bulk ship all packed units at once
- Auto-save to browser localStorage

## Tech Stack
- React 18 + Vite
- `useReducer` for game state, `useRef` stateRef pattern for worker ticker
- localStorage persistence (`lrt-v2` key)
- Capacitor planned for Android/iOS/desktop

## Planned
- Sales channels: eBay → Amazon → Woot → Wholesale contracts
- Quest system (e.g. process 200 units → unlock a wholesale buyer)
- Stats/analytics page
- Device types: desktops, tablets, monitors
- Painting station
