# SPC-3.2 Hollow Asteroid: decomposition and grammar

Source: `source-SPC-3.2.png` (1456×816). Grid: 6 columns A–F × 4 rows 1–4, each cell 243×204 px (`grid.jpg`). Zoom crops: `crops/`.
Measured colours: `palette.json`.

Labels: **O** = observed, **I** = inferred, **P** = proposed for the 3D scene.

## 1. Style (this governs everything else)

The image is a **flat, cel-painted 2D illustration**, not a 3D render (O):

- colour sits in flat, hard-edged patches (posterised, about 3–4 tones per material);
- there are dark ink-like contour lines in places, with no outline on others;
- a brushy, directional patch texture follows the rock flow (diagonal strokes in E1–F2);
- there is no smooth gradient shading, no specular highlights, and no depth-of-field blur.

A faithful reconstruction needs **toon shading** (quantised light bands), **flat patch texture**, **edge lines** and **no photographic effects**. Bloom is limited to the cyan opening.

## 2. Composition

| ID | Region | Feature | Notes |
|---|---|---|---|
| HA-C1 | whole frame | The camera is inside a twisting cave tunnel, looking slightly down and forward. A bright opening is at the centre (C2) and the ship sits just below it (C3) | O |
| HA-C2 | B1–C1→C2 | **Arch / bridge.** A thick rock band crosses the top-left to top-centre over the main opening, lit warm orange on top (B1) | O |
| HA-C3 | C2 (+D2 sliver) | **Main opening.** A bright cyan-turquoise void (#83bcd2, up to the light-blue C2 mean #6798b6), irregular and heart-like, with distant blue rock silhouettes and sponges inside it | O. This is the main light source |
| HA-C4 | B3 | **Second, smaller opening**, cyan, below and left of the main one | O |
| HA-C5 | D1–D4 | **Right column / wall.** A vertical rock mass whose left-facing side is lit hot orange in D3 (#8b4e66 mean, highlights #eb776b) and which turns purple to the right | O |
| HA-C6 | A2–A4, B3–B4 | **Left wall and floor slope.** Lit orange on the faces turned toward the camera (A3, B4), with a dark purple foreground boulder at A4 | O |
| HA-C7 | E1–F4 | **Right foreground wall.** Large and in shadow: purple-indigo (#2a163e, #191136), with directional brush strokes running down-left | O |
| HA-C8 | B4–C4 | **Floor ridge.** A warm lit sloping ledge leading the eye from the bottom centre to the ship | O |

## 3. Objects

| ID | Region | Object | Appearance |
|---|---|---|---|
| HA-S1 | A2–A3 | **Large sponge, left**, about 0.17 of the frame height. Orange-lit (#eb776b) with dark purple cavities | Porous sphere, holes 8–15% of its diameter, dense |
| HA-S2 | D1 | **Large sponge, top right of centre**, coral red, partly cut by the top edge | Same family; bigger holes, including a triangular one |
| HA-S3 | F3–F4 | **Huge sponge, right edge**, dark magenta in shadow (#3a0e38–#6a234e) | Same family, unlit |
| HA-S4 | B3–C4 | **Floor sponges.** A big one at B3/C3 left of the ship and a big one at C4, orange-red | Lit |
| HA-S5 | everywhere | **Small sponges and pebbles**, 20+ visible, dotted on the walls (E2, E1, D4, C1, A2): red and magenta, small | Instanced filler |
| HA-S6 | B2, A1 | Distant sponges in shadow and blue haze: purple, low contrast | Depth layers |
| HA-K1 | C3 | **Ship.** About 0.17 of the frame wide. White fuselage, a short rounded capsule seen from behind and three-quarter left; an orange rear engine ring with two dark round nozzles; swept white wings with orange trailing tips; two thin rear antennae with orange tips; a small orange nose cap | Hero prop |
| HA-L1 | C3, B2 | **Two small cyan light orbs** (#9fe8ff-like dots) floating near the ship | Emissive motes |

## 4. Lighting and colour (measured)

- Mean luminance is 0.221; percentiles 1/50/99 are 0.034, 0.173 and 0.767. That's a dark scene with a few very bright lit patches and the opening.
- Clusters: #2b1944 (24.6%), #150c2b (22.1%), #3c315c (18.9%), #405783 (9.8%), #6a234e (8.1%), #eb776b (7.2%), #b1475e (5.9%) and #83bcd2 (3.5%).
- **Key light:** a warm orange-coral (#eb776b → #f2a080) from the **front-left, low**, i.e. coming from behind the camera's left (O: lit faces point toward the camera and left). I: its source isn't shown.
- **Back light:** cyan from the opening, rimming blue-grey rock near it (C1–C2 #47395b → #6798b6). O.
- **Shadow colour:** saturated purple-indigo, never black (#150c2b darkest). O.
- **Depth:** distant rock goes desaturated blue (#405783) toward the opening. O.

## 5. Grammar

- **Cave field:** a signed-distance field. Solid rock everywhere minus a carved, twisting tunnel (a warped capsule chain) running from the camera to the opening, plus an open void beyond the opening. An arch is left as a solid band across the tunnel mouth, and a side hole makes the second opening (O for the topology, I for the hidden geometry behind the walls).
- **Rock surface:** a directional ridge texture in object space (stretched noise along the wall's down-slope), quantised into flat patches (O, HA-C7 strokes).
- **Toon lighting:** `band = floor(4 · (key·n·0.5 + 0.5) · ao)`. Band colours come from measured ramps: shadow #150c2b, #2b1944, #3c315c; lit #8b4e66 → #eb776b → #f2b28a (I for the top tone). Cyan rim term from the opening direction.
- **Sponge family S(r, holes):** a sphere whose albedo comes from a 3D Voronoi cell pattern. Cell centres become dark cavities (#2a0f30) and cell borders keep the coral surface, with cavity size 0.25–0.45 of the cell. The same toon bands apply. Placement: on wall surfaces with a density bias near the tunnel, with a size power law (O).
- **Ink lines:** a screen-space depth and normal discontinuity edge, drawn in dark purple (#1a0b26), applied only to strong edges (O: partial outlines).
- **Ship:** built from capsule, cone, wing and ring parts (P). The proportions are measured from HA-K1: fuselage length to diameter about 2.4:1, wing span about 1.9× the fuselage length.

## 6. Hero camera

The camera is in the tunnel about 7 m behind and 1.5 m above the ship, looking at the opening about 5° downward. Vertical FOV is about 60° (I). Frame is 16:9. Matching is judged per grid cell: mean colour, the opening's position and size (C2), the ship's position (C3) and the sponge positions (A2–A3, D1, F3, C4).

## 7. Known losses and decisions

- Brush-stroke painting detail is approximated with procedural patches. Hand-painted stroke direction variation will be partly lost.
- Geometry behind walls and outside the frame is invented (I) so you can fly through. The source covers only this view.
- The key-light source is hidden in the source. A directional light is assumed.

## 8. Decisions added during the worst-cell pass (2026-11-16)

- **Key light:** a cone light behind and left of the camera (I), with its upper edge cut, because the source keeps the ceiling and upper column dark (O, C1/D2).
- **A4 foreground boulder:** added as solid rock outside the cone (O: the dark mass at the lower left).
- **Right rock mass:** its left face now stands at x ≈ 2 m and widens toward the camera. HA-S3 was moved in front of it so it is not buried.
