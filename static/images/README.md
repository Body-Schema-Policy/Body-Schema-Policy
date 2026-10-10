# Figure provenance

Every figure on the page is the paper's own figure, exported from the manuscript sources named below. No new scientific values were generated for this page. The site icon is an original, generic schematic of connected body joints drawn as SVG.

Each figure also has a `-1200.webp` copy at 1200 px wide (Lanczos from the same render, `cwebp -q 90 -m 6`), which the page serves to narrow screens through `srcset`; the full-size file stays the default and the enlarged view.

## Hero teaser

`teaser.webp` is the paper's Figure 1, exported from `../figures/BSP_teaser_fig1_v12.pdf` (the file `main.tex` includes) with `pdftocairo -png -singlefile -scale-to-x 2400 -scale-to-y -1`, then `cwebp -q 90 -m 6`. Its page caption keeps the title sentence of the paper's caption, followed by a one-sentence summary of the right panel.

## Expressivity

`fk-extrapolation.webp` is panel d of the paper's forward-kinematics figure (`fig:fk_curves` in `../sections/appendix.tex`): `../figures/fig_fk_render.png` (7272×2151) resized to 2400 px wide with Lanczos, then `cwebp -q 90 -m 6`. Its page caption follows Section 5.1 of the paper and the panel's own caption.

The Fetch, Franka and Stretch options show the three strips of the paper's `fig:fk_renders` (same appendix), exported the same way: `fk-extrapolation-fetch.webp` from `../figures/fk_render_fetch.png` (7298×1007), `fk-extrapolation-franka.webp` from `../figures/fk_render_franka.png` (7272×1603) and `fk-extrapolation-stretch.webp` from `../figures/fk_render_stretch.png` (7272×1720). Their page captions follow that figure's caption (the 3.3 m shift on Fetch, the two errors on Stretch) and Section 5.1. The Franka shown is the fixed-base one.

## Method overview

`method-overview.webp` is the paper's architecture figure (`fig:arch` in `../sections/architecture.tex`), exported from `../figures/bsp_overview.pdf` with `pdftocairo -png -singlefile -scale-to-x 4800 -scale-to-y -1`, downscaled to 2400 px wide with Lanczos, then `cwebp -q 90 -m 6`. Its page caption keeps the paper caption's title and summarizes the architecture in one sentence.
