# Expected-Value Radar — token-radar-01 (round 3)

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Bangzo1708/token-radar-3/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Bangzo1708/token-radar-3/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Which pre-token protocol is worth farming next, and what do I do about it? It reads the sealed DeFiLlama snapshot, prices every protocol that records no token as an **expected value** —

```
implied value = TVL × peer multiple × momentum × breadth × launch probability
```

- **Peer multiple**: median mcap/TVL of the launched protocols in the same category (global median as fallback), computed from the snapshot itself.
- **Launch probability**: maturity × staleness × category prior. Exchanges, bridges and liquid-staking products get a 0.01 prior — they are already a product of a token that trades, not a launch waiting to happen.
- **Momentum / breadth**: 7-day TVL growth and chain count, small adjustments.

The board covers all 342 pre-token protocols (the 40-protocol watchlist is the floor, never the ceiling), each with a five-step farm plan naming amounts and cadence. The dashboard shows a "Farm this week" top 5, a sortable and filterable board, a detail view with the full model breakdown, and the methodology.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=dkj7ja9h&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
