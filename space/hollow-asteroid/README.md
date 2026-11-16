# Hollow Asteroid: a Midjourney concept rebuilt as a flyable WebGPU scene

**Open `index.html` in a WebGPU browser** (desktop Chrome or Edge, or Safari 26+). Click *Fly in*. Key **1** returns to the concept's camera. WASD to fly, mouse to look, E/Q up/down, Shift faster, H stats.

This folder sits on a fork of [Noniv/abyssal-garden](https://github.com/Noniv/abyssal-garden). It reuses that project's `source/src/math.js` **unchanged**: noise, surface nets, mesh builders. It also borrows its rendering ideas: HDR with MSAA, reversed-Z depth, instancing, one shared fog/absorption function applied to every surface, a bloom chain, a GPU-timed dynamic-resolution band and zero per-frame allocations. The small engine in `source/src/engine.js` and the scene in `source/src/scene.js` are new code, written by Claude (Anthropic's model, in Claude Code) in one session, directed by Evan Robinson.

| | |
|---|---|
| Concept | `process/concept-SPC-3.2.png`, one image picked from a 16-image Midjourney board |
| Page size | about 53 kB, one self-contained HTML file |
| Concept vs render | mean grid-cell colour difference 0.359 → 0.054 over the iterations |

## How it was made

1. **Pick a concept.** Evan chose this exact image from a Midjourney board.
2. **Decompose it.** The image was cut into a 6×4 grid with feature IDs, zoom crops and measured colours (`process/grid.jpg`, `process/crops/`, `process/palette.json`). The decomposition is in `process/DECOMPOSITION.md`, with each parameter marked observed, inferred or proposed.
3. **Derive a grammar and build procedurally.** `source/src/scene.js` comments cite the decomposition IDs.
4. **Compare at the concept's camera and revise.** `process/compare.py` writes a source / render / difference / overlay sheet and per-cell JSON. First and final sheets are in `process/compare/`.

Mean cell colour difference per iteration (0 means identical cell colours; this is a guide for iteration, not a fidelity percentage):

| version | difference |
|---|---|
| ha-v1 | 0.3589 |
| ha-v2 | 0.1 |
| ha-v3 | 0.0997 |
| ha-v4 | 0.1469 |
| ha-v5 | 0.1615 |
| ha-v6 | 0.1457 |
| ha-v7 | 0.1381 |
| ha-v8 | 0.1021 |
| ha-v9 | 0.1022 |
| ha-v10 | 0.1022 |
| ha-v11 | 0.1022 |
| ha-v12 | 0.1165 |
| ha-v13 | 0.0735 |
| ha-v14 | 0.0711 |
| ha-v15 | 0.0655 |
| ha-v16 | 0.0643 |
| ha-v17 | 0.0539 |

## Rebuild

```bash
cd space/hollow-asteroid/source && node build.mjs   # writes ../index.html (reads ../../../source/src/math.js)
```

URL options: `?shot=0&t=3` renders one fixed 1456×816 frame and tries to upload it to a local dev server. `?timer` drives frames from a timer instead of requestAnimationFrame, for testing in a background tab.

## Licence

Abyssal Garden is MIT, © 2026 Maksymilian Dendura (see `LICENSE` at the repo root). This folder's new code is offered under the same MIT terms.
