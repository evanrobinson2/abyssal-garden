# SPC-1.3 Nebula Reef: decomposition and grammar

Source: `source-SPC-1.3.png` (1456×816). Grid: 6 columns A–F × 4 rows 1–4, each cell 243×204 px (`grid.jpg`). Zoom crops: `crops/`.
Measured colours: `palette.json` (per-cell mean, 10th and 90th percentile, and 8 k-means clusters).

Labels: **O** = observed in the image, **I** = inferred (hidden or ambiguous), **P** = proposed to make it work as a 3D scene.

## 1. Composition

| ID | Region | Feature | Notes |
|---|---|---|---|
| NR-C1 | whole frame | A wide, low camera looking **up and forward** into a swarm of floating rocks. The rocks recede toward a hazy vanishing area around C2–D2 | O. Strong perspective: the near rocks are huge and cut by the frame edges |
| NR-C2 | A1→F1 diagonal | Light comes from the upper right (E1–F1). The swarm streams from the lower left (near) to the upper right / centre (far) | O |
| NR-C3 | C2–D3 | A dense band of small and mid rocks forming the reef's depth layers, about 60+ visible pieces | O. Count estimated from the crops |
| NR-C4 | D3–D4, F4 | A large dark translucent mass behind the mid rocks: a giant rock silhouette lost in haze | O/I. It reads as a very distant big rock, not a cloud |
| NR-C5 | — | **No whales are visible**, even though the prompt asked for them | O. The source wins, so whales are not reconstructed |

## 2. Objects

| ID | Region | Object | Appearance | Role |
|---|---|---|---|---|
| NR-R1 | A2–B4 (and A4) | **Hero rock, lower left.** Fills about 30% of the frame and is cut by the frame | Layered, flaky plates (shale-like terraces) on the top face; smooth, rounded, dark teal underside; a warm tan rim where the starlight grazes the top edge (#a18965→#e3b172); green glints are dense on its top | Foreground frame |
| NR-R2 | A1–B1 | **Upper-left shard rock.** A long slab, cut by the top edge, seen from below | Tan lit edge at the right end, teal underside | Frame |
| NR-R3 | E2–F2 (+F1) | **Right slab rock**, back-lit against the star flare | Silhouette darker than the sky, teal and grey body, glints along its top ridge, rim-lit edge | Mid-ground anchor |
| NR-R4 | C3–D3 | **Centre rock**, mid-distance and fully visible | Lumpy, tan-brown lit top, a few glints | Focal mid-ground |
| NR-R5 | E4–F4 | **Lower-right rock**, near and cut by the bottom edge | Tan lit top, dense green glints | Foreground |
| NR-R6 | D3–E3 | Two mid rocks (an elongated one at D3–E3, a small one at E3) | Same material | Mid |
| NR-R7 | B2, A2 | Small near rocks top-left of the hero rock (an oval at A2, a cluster at B2) | Warm lit | Near filler |
| NR-F1 | C1–D2, C2–D3 | **Distant swarm.** Pebble- to boulder-sized rocks, soft-edged and losing contrast into teal haze; tan highlights stay on the sunward sides | Filler, 10³+ instances |
| NR-G1 | on R1, R3, R4, R5 | **Green crystal glints.** Small bright emissive specks (#3cf08a-like, about 2–6 px), clustered on lit upper faces and ridges, sparse in shadow | Emissive points, with bloom |
| NR-S1 | E1–F1, E2 | **Star flare.** A hot orange-gold glow (#e3b172 core, approaching white) with long streaky diagonal filaments from upper right toward the centre | Light source plus streaks |
| NR-S2 | A1–D4 | **Nebula medium.** Teal haze, darker and bluer toward the top-left corner (A1 #1a5557) and brightest teal around C3–D3 (#338175); cloudy mottling | Medium / sky |
| NR-S3 | D1–E2 | **Warm cloud bank.** Smoky darker clouds edged with amber, between the swarm and the star | Medium detail |
| NR-S4 | throughout | **Stars / specks.** Sparse tiny blue-white points, small and dim | Sky |
| NR-S5 | B4–C4, A3 | **Cyan speed streaks.** A few thin bright blue lines running diagonally (down-left) | Light streaks / motion. I: read as tiny fast motes or beams |

## 3. Lighting and atmosphere (measured)

- Image mean luminance is 0.343; percentiles 1/50/99 are 0.070, 0.328 and 0.776. That's a mid-key scene with only the flare and glints near white.
- Dominant clusters: #225358 (28.5%), #2e6b6b (20.9%), #0d2523 (16.9%; deep shadow on the hero rock), #5a6c62, #a18965 (rock lit), #499b8a, #e3b172 (flare and rim) and #4c4c3a.
- **Key light:** a warm gold star at the upper right (O). It lights the top and right faces of the rocks, with rims on the silhouettes.
- **Fill:** teal ambient from the nebula (O). Shadow sides go teal, not black: the hero rock's underside is #0b211b–#06282b.
- **Depth:** objects fade into teal with distance (O). Contrast drops and the hue shifts toward #367371. The warm in-scatter is strongest toward the star (E1–E2 cells reach luminance 0.53).
- **No hard cast shadows** are visible between rocks (O), so soft ambient occlusion only.

## 4. Grammar (from the evidence above)

- **Rock family R(size, flatness, flake):** a noise-displaced icosphere. The low-frequency shape is lumpy and flattened along one axis (flatness 0.45–0.75, O from the slabs R2/R3 and the flatter R1). Terraced plates come from quantising the radial displacement into steps (flake 0–1, O from R1's shale plates). Material: tan albedo on the lit side and teal ambient; glints seeded on faces with an upward/sunward normal.
- **Swarm placement:** density is highest in a tube from near-camera lower left toward the far upper-right/centre, i.e. along the view direction. Size follows a power law (many pebbles, few slabs), O. Rocks get a slow random tumble (P, motion).
- **Glints G(rock):** about 1 glint per 0.6 m² of lit face (I), brighter on sunward normals, and clumped: 30% of glints cluster in groups of 3–8 (O on R1).
- **Medium:** fog colour `#367371`, with a density that hides the farthest rocks by about 160 m (I). Sunward in-scatter tints toward #e3b172 with a Henyey–Greenstein-like phase (I). Per-channel extinction so warm colours die first (P, Abyssal method).
- **Sky:** fbm nebula. Teal base, deep blue-teal at the top-left, amber around the star, star filaments as noise stretched along the A4→F1 diagonal (O).
- **Shafts:** screen-space radial streaks from the star, occluded by rocks (O for the streaks in E1–F1).

## 5. Hero camera (for the matched comparison)

The camera is about 6 m below and in front of the hero rock R1, looking up about 25° and turned about 20° toward the star. Vertical FOV is about 70° (I, from the strong perspective of R1 and R5). The frame is 16:9. Matching is judged on the 6×4 grid: cell mean colours, the luminance distribution, and the position and size of R1, R3, R4, R5 and the flare.

## 6. Known losses and decisions at this stage

- Whales: not in the source, so not built (NR-C5).
- Rock micro-detail (individual shale plates, cracks) is approximated by quantised noise terraces, not sculpted plate geometry. Expect a loss in plate crispness on R1.
- Cyan streaks (NR-S5) are reconstructed as fast-moving thin motes. Their meaning in the image is ambiguous.

## 7. Decisions added during the worst-cell pass (2026-11-16)

- **Upper sky:** darkens toward the top except near the star (O: A1/C1/D1 are darker than the centre).
- **Teal haze:** the haze behind the swarm (NR-S2, C3–D3) is a tighter, brighter lobe.
- **Flare and medium in-scatter:** more saturated orange, with less green (O: F1 #a4815b).
