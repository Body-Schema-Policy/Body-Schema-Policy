# Denoising data provenance

Written by `tools/build_denoising.py` from the denoising-steps pack; do not edit the files by hand. The page shows one frame, Handover episode 15 frame 354: the frame of the Handover strip in the paper's appendix.

- `HAND/crop.png`: the head-camera crop the policy saw, 224×224, copied unchanged from the pack.
- `HAND/steps.js`: for BSP and for the size-matched U-Net and Rodrigues Network, which read one pooled image vector, the clean-action estimate after each of the 100 DDPM iterations as 39 body points for each of the 16 actions of the chunk, projected into the crop; the same points for the demonstration's 16 actions; and each iterate's whole-body error in degrees. The layout is described at the top of `tools/build_denoising.py`.

Points are stored to 1/8 of a crop pixel. The errors are the pack's, rounded to five decimals.

## The error shown

The number beside each model's name and the curve under the panels are one quantity: the mean absolute difference, over the 31 joint commands of the hands, arms and waist, between the estimate's next action, drawn solid, and the demonstration's next action: the thin white line in the models' panels, and the solid one in the demonstration's own. The base commands are not part of it. It can rise again after falling, and is shown as it is.

This is not the error of the paper's denoising figure, which scores the 14 arm joints over all 16 actions of the chunk. That error is not on the page.

## What the build is checked against

The build stops unless the pack reproduces, for this task:

- the paper's right panel: the arm-joint error first falls below 1° at iteration 17 for BSP, 39 for the Rodrigues Network and 92 for the U-Net. This ties the pack to the paper's figure. For BSP on this task the pack takes that curve from a second capture of the same model and initial noise; it records that the two captures differ by at most 0.020° and cross 1° at the same iteration.
- the pack's values of record for the whole-body error: first below 2° at iteration 4 for BSP and 74 for the Rodrigues Network, never for the U-Net; first below 1° at iteration 12 for BSP, never for the other two; 0.19°, 1.71° and 12.53° for BSP, the Rodrigues Network and the U-Net after the last iteration.

## How the panels are drawn

The chunk is drawn with the strokes of the paper's strip file, `../figures/assets/story/s4/render_unetpool/S4_4_body_strips.pdf`: 0.7 pt for the next action over a 1.25 pt dark edge, and 0.35 pt at 30% opacity for the later actions, on a 30.567 pt panel. The page leaves out the strips' wrist dots and adds the demonstration's next action as a white line under the estimate's. A loop is the 100 iterations and then the last one held for 20 frames, at 75 ms a frame.

A fourth panel, after the three models, is the ground truth: the demonstration's own 16 actions, drawn with the same strokes and without the white line. It is the same at every iteration, and it has no error and no curve.
