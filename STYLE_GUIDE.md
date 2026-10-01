# Lanternkeeper — Style Guide: "Ink and Ember"

> A woodcut print lit by a single flame.

This document is the contract for every asset, shader and effect. When in doubt,
ask: *would this survive being cut into a block of pear wood and printed in two inks?*

---

## 1. The four colours

| Token | Hex | Role |
|-------|-----|------|
| **ink**   | `#07060A` | Everything the flame does not reach. Default state of the world. |
| **oil**   | `#1A1210` | The first breath of light; wet darkness; the water's body. |
| **ember** | `#FF8A1F` | Lit surfaces. The colour of *being seen*. |
| **cream** | `#FFE2B0` | The hottest light only: flame core, hot spots, wet glints. |

**Nothing else.** This is enforced in code, not just by taste: the final composite
pass converts every pixel to luminance and maps it onto a ramp whose stops are the
palette colours' own luminances (`composite.frag.glsl → paletteRamp`). Any
intermediate value is a linear blend of two neighbouring palette inks, like two
inks overprinting. `post.paletteStrength < 1` is a debugging escape hatch only.

Paper grain, film grain and vignette are applied **to luminance before** the
palette mapping, so even the texture stays on-palette.

## 2. Light

* There is exactly **one light**: the lantern flame. No ambient, no hemisphere
  light, no environment map, no fill. If the flame can't see it, it's ink.
* The flame is alive: layered value noise drives intensity, colour temperature
  (ember ↔ cream) and a few millimetres of *position* jitter, so shadows breathe.
  Occasional "gutters" dip the flame for a fraction of a second.
* The lantern body casts real shadows (posts, cap, tray, and, when closed, the
  punched-tin shutters). Lantern geometry *is* the gobo.
* **Wide glow** (default): ~4 m pool of ember, a hatched ring out to ~8 m, then ink.
* **Focused beam** (click / F): shutters slide up, the light becomes a ~17° cone
  with ~2× reach. The lantern itself goes dark except its pierced star.

## 3. Surfaces: the band model

Light intensity `I = N·L × attenuation × shadow × albedo × flicker` is cut into
**hard bands**, never a gradient:

| Band | Range (default) | Treatment |
|------|-----------------|-----------|
| ink   | `I < 0.085` | Flat ink. No detail. Outlines mostly vanish here. |
| mid   | `0.085 – 0.36` | Oil-brown base carved by **cross-hatching** (see §4). |
| ember | `0.36 – 0.95` | Flat ember with sparse chisel gouges and masonry joints. |
| cream | `> 0.95` | Hot spot. Almost no marks. |

* Band edges are *carved*: a 3D noise field nudges `I` so borders wander like a
  gouge following grain (`bands.noise`). They are not perfect isolines.
* **Wet glints**: Blinn specular, thresholded (never smooth) into a cream cut.
  Everything below ~1 m is soaked: darker albedo, tighter, stronger glints.
* **Masonry**: stone surfaces carry world-space ashlar joints (wandering courses,
  staggered head joints, chipped mortar) and paving on floors. They are the scale
  ruler of the space — never remove them from stone.

## 4. Hatching rules

* Hatching lives **only in the mid band**. Lit areas get rare gouges; dark areas
  get nothing (ink is ink).
* **World-anchored**, triplanar with hard plane selection. Strokes never swim.
* Darker → denser: primary strokes thicken; at ~30% darkness the in-between strokes
  appear (density doubles, rotated `angleVar`); past `crossStart` a second family
  crosses at ~70°, then a fourth fills in at the bottom of the band.
* Hand quality: low-frequency lateral wobble per stroke, width swelling along the
  stroke (pressure), random breaks (the gouge skipping).
* Distance LOD: density halves every doubling of `lodDistance`, cross-faded, with
  a per-stroke identity that survives LOD changes. Sub-pixel strokes fade to their
  average tone instead of aliasing.
* The held lantern hatches in **object space** so its marks stay glued to it.

## 5. Ink outlines

* Depth (second derivative of 1/z, robust on slopes) + view-normal discontinuities.
* Width varies with a low-frequency noise and with distance (near lines are fatter).
* Slight hand wobble that **boils** at 4 fps (`outline.boilFps`; 0 freezes it).
* Outlines are strong **where light touches** and fade in darkness. In darkness a
  very faint ember edge (`darkGlow`) may survive — like the white-line engraving
  technique — hinting at architecture without lighting it.

## 6. Water and oil

* The floor is black water. Its own body is near-ink; it shows the world only
  through **reflection**: planar, warped by swell and ripples, **stretched
  vertically** toward the viewer, posterised into a few tone steps, and broken by
  horizontal engraved lines.
* The flame produces a narrow anisotropic glint streak.
* Oil film: **hairline** contour lines of a slowly advected field, torn and only
  visible where lit. Brown/ember only. Never rainbow, never iridescent.
* Drips and footsteps spawn ring ripples.

## 7. Atmosphere

* Volumetric haze is **lantern light only**: raymarched inside the light's sphere,
  shadowed by the same cube map (pillars cut real shafts), densest near the water.
  It hugs the flame and the beam. The air right in front of the eyes is kept clear.
* Embers: few, small, diamond-cut (not soft dots), hot only near the flame.
* Drips catch the light as thin falling slivers.
* **Bloom is for the flame only**: threshold above anything a lit surface can reach.
* Film grain (24 fps stepped), paper tooth & fibres, vignette: on luminance.

## 8. Creatures

* **Pure black mass.** No interior shading, no hatching, no texture.
* A thin ember rim (fresnel, thresholded to a line) is the *only* thing that
  betrays the silhouette; it grows a little when the lantern is near and has a
  heat-haze shimmer. Back faces are never rimmed.
* Read them by silhouette: proportions must be *wrong* (too tall, too thin, limbs
  too long, antlers, bowed heads). Test them in the focused beam at 10 m.

## 9. Do / Don't

| Do | Don't |
|----|-------|
| Let most of the screen be ink. | Add fill lights "so the player can see". |
| Cut gradients into bands. | Use smooth gradients or PBR roughness ramps. |
| Anchor marks to the world. | Use screen-space textures that swim. |
| Keep the flame the brightest thing. | Bloom lit walls. |
| Make silhouettes do the storytelling. | Detail creatures. |

## 10. Tuning workflow

Everything above is a live slider in the look-dev panel (`H` toggles it). Use
**📋 Copy settings as JSON**, paste the result into `DEFAULTS` in
`src/core/Settings.js` (or share via the `?settings=<base64 json>` URL param).
Debug views (panel → General → View): raw colour, normals, light band, fog,
outlines, NaN check.
