# Blind Year

A daily 90-second market puzzle. Everyone gets the same secret month from 1881–2013 and sees only
valuations (CAPE, dividend yield, the 10-year rate, inflation), never dates or prices. You make 5 moves,
splitting $10,000 between stocks, 10-year bonds and a mattress, and each move is locked for 2 years.
Everything is scored in real (after-inflation) dollars against a plain 60/40 mix. Then the year is revealed,
along with a spoiler-free share card and an album of the eras you've collected.

## Play

It's a static site with no build step.

```bash
python3 -m http.server 8833 --bind 127.0.0.1
```

Then open http://127.0.0.1:8833. 

- **Daily:** puzzle #1 is 2026-11-18 (local date). `?n=12` opens puzzle 12, which is handy for testing.
- **Practice:** a random year that doesn't count toward your streak, though its era still goes in the album.
- **Progress:** stored in `localStorage` (`blindyear.v1`). Moves you've locked can't be redone, so reloading won't let you peek.

## How the numbers work

| Asset | Monthly real return |
| --- | --- |
| Stocks | (price + dividend/12) / last price, deflated by CPI |
| Bonds | A fresh 10-year par bond bought at that month's yield, repriced a month later at the new yield, plus the coupon, deflated by CPI |
| Mattress | 0% nominal, so it only moves with inflation |

Within a move, each sleeve rides on its own for 24 months with no rebalancing. Each move is graded against
60/40 over the same 2 years: 🟩 more than 1 point better, 🟨 within 1 point, 🟥 more than 1 point worse.
"Perfect hindsight" means going all-in on the best asset every move.

The daily order is a fixed seeded shuffle of all 1,590 eligible start months, so there are no repeats for about 4 years.

## Files

| File | What it is |
| --- | --- |
| `data.js` | Generated from Shiller's data. Don't edit it by hand. |
| `engine.js` | Returns, simulation, daily seed, share text and eras. Pure, with no DOM. |
| `ui.js` | Screens, the split bar, charts, storage and the album. |
| `tools/build_data.py` | Rebuilds `data.js`: `python3 -I tools/build_data.py raw/shiller.csv data.js` |
| `tests/checks.js` | Data sanity checks, known-history returns (1929 crash, the 80s–90s bull market, the 2000s, Volcker-era bonds), sim math, daily order, and that share text never includes the date. |

## Checks

```bash
./test.sh
```

## Data

Robert Shiller's monthly data, via [datasets/s-and-p-500](https://github.com/datasets/s-and-p-500) (ODC-PDDL-1.0,
public domain). Dividends end in 2023-06, so the latest start month with 10 years ahead is June 2013.
To refresh: `gh api repos/datasets/s-and-p-500/contents/data/data.csv -H "Accept: application/vnd.github.raw" > raw/shiller.csv`, then rerun the build script.
