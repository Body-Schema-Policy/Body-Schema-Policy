# Sensitivity data provenance

Written by `tools/build_sensitivity.py`; do not edit the files by hand. One episode per task, each shown as its own looping row under the task's full name: LocomotionPickBetweenTables (`LPBT`) episode 0 (581 frames), XMoveBendPick (`XMBP`) episode 0 (411 frames) and Handover (`HAND`) episode 15 (479 frames), at 50 frames per second.

Per task:

- `video.mp4`: the head-camera crop the policy saw, 224×224, copied unchanged from its pack.
- `maps.js`: five maps per frame, all read at the denoiser input. BSP's right-thumb, waist-yaw and base-velocity rows come from one 36-row capture at the patch tokens its denoiser reads. For the size-matched U-Net and Rodrigues Network, which read one pooled image vector, the map is that vector's footprint on the patches.

Each map is stored as `round(255 × map / its own maximum)`.

## Known sensitivity to the machine

On HAND, BSP's maps depend on the machine that computed them: against a capture of the same checkpoint and inputs on another machine, 35 frames (all between t = 315 and 347 or between t = 451 and 469) differ by more than 1% in a row's total sensitivity, and the largest difference in a map value is 0.037. A repeat on the same machine is bit-identical, and a rounding-level change in the denoising trajectory also moves 34 of those 35 frames by more than 1%. On XMBP the two machines agree within 3.1% of a row's total sensitivity. The page shows one machine's capture throughout.
