/* Body-queried vision: one row per task, each looping its episode with the sensitivity maps at the denoiser input. */
(function () {
  "use strict";
  const data = window.BSP_SENSITIVITY;
  const host = document.getElementById("sensitivity");
  if (!data || !host) return;
  const HELD = "This browser is holding playback back. Click the panels to start it.";
  const lessMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const notes = new Map();   // what is still loading or went wrong, by source
  let started = false, visible = false, stopped = lessMotion.matches;   // stopped by the reader, or for less motion
  window.BSP_SENSITIVITY_MAPS = window.BSP_SENSITIVITY_MAPS || Object.create(null);

  // Same colour stops as the paper's maps; byte b of a map is drawn as colour(b / 255), zero patches stay clear.
  const stops = [[0,0,4],[28,16,68],[79,18,123],[129,37,129],[181,54,122],[229,80,100],[251,135,97],[254,194,135],[252,253,191]];
  const lut = new Uint8ClampedArray(256 * 4);
  for (let b = 1; b < 256; b++) {
    const position = b / 255 * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(position)), f = position - i;
    for (let c = 0; c < 3; c++) lut[b * 4 + c] = Math.round(stops[i][c] + (stops[i + 1][c] - stops[i][c]) * f);
    lut[b * 4 + 3] = 255;
  }
  const patches = document.createElement("canvas");
  patches.width = patches.height = data.patch_grid;
  const patchContext = patches.getContext("2d");
  const patchImage = patchContext.createImageData(data.patch_grid, data.patch_grid);

  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }

  const player = node("div", "sensitivity-player");
  const grid = node("div", "sensitivity-grid");
  const status = node("p", "episode-status"); status.setAttribute("role", "status");
  player.append(grid, status);
  host.append(player);

  // Columns: BSP's parts, each with its own map, then a gap, then the pooled baselines, which hand every part the
  // same image vector and so have one map each. A panel keeps the position of its series in the map file.
  const order = data.series.map((_, s) => s).sort((a, b) => Boolean(data.series[a].shared) - Boolean(data.series[b].shared));
  const firstShared = order.findIndex(s => data.series[s].shared);
  function cells(row, lead, cell) {
    row.append(lead);
    order.forEach((s, k) => {
      if (k === firstShared) row.append(node("span", "group-gap"));
      const made = cell(data.series[s], s);
      if (made) row.append(made);
    });
    grid.append(row);
  }
  // The play button sits at the right end of the group-title row, over the baselines' columns.
  const toggle = node("button", "viewer-play");
  toggle.type = "button";
  toggle.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path/></svg>';
  const groups = node("div", "sensitivity-row is-head");
  groups.append(node("span", "task-name"), node("p", "group-title is-own", "BSP (ours)"), node("span", "group-gap"),
                node("p", "group-title is-shared", "Size-matched baselines"), toggle);
  grid.append(groups);
  cells(node("div", "sensitivity-row is-head"), node("span", "task-name"),
        entry => node("p", entry.shared ? "series-name" : "series-name is-ours", entry.label));

  const rows = data.tasks.map(task => {
    const row = { task, index: 0, maps: null, loading: false, blob: null, videoCallback: null, animation: null, panels: new Array(data.series.length) };
    const video = row.video = node("video", "episode-source");
    video.muted = true; video.loop = true; video.playsInline = true; video.preload = "auto";
    video.setAttribute("muted", ""); video.setAttribute("playsinline", "");
    video.setAttribute("aria-hidden", "true"); video.tabIndex = -1;
    player.append(video);
    const name = node("p", "task-name");   // a long task name may wrap where a capital follows a small letter
    let word = "";
    for (const letter of task.label) {
      if (/[A-Z]/.test(letter) && /[a-z0-9]$/.test(word)) { name.append(word, document.createElement("wbr")); word = ""; }
      word += letter;
    }
    name.append(word);
    cells(node("div", "sensitivity-row"), name, (entry, s) => {
      const figure = node("figure", entry.shared ? "sensitivity-panel" : "sensitivity-panel is-ours");
      const media = node("div", "episode-media");
      const canvas = node("canvas", "map-canvas"); canvas.width = canvas.height = data.crop;
      canvas.setAttribute("role", "img");
      const series = entry.shared ? entry.label : `BSP, ${entry.label}`;
      canvas.setAttribute("aria-label", `${task.label}, ${series}: sensitivity over the head-camera view`);
      media.append(canvas);
      figure.append(media);
      row.panels[s] = canvas.getContext("2d");
      return figure;
    });
    video.addEventListener("loadeddata", () => {
      if (!seekable(video) && refetch(row)) return;   // the copy in memory reports here again
      present(row, video.currentTime);
      sync();
    });
    video.addEventListener("seeked", () => present(row, video.currentTime));
    video.addEventListener("play", () => schedule(row));
    video.addEventListener("playing", () => report("held", ""));
    video.addEventListener("pause", () => cancel(row));
    video.addEventListener("play", showState); video.addEventListener("pause", showState);
    video.addEventListener("error", () => { if (!refetch(row)) report(`${task.id} video`, `${task.label}: episode video unavailable.`); });
    return row;
  });

  function report(source, text) {
    if (text) notes.set(source, text); else notes.delete(source);
    status.textContent = [...new Set(notes.values())].join(" ");
  }

  async function decompress(encoded) {
    const binary = atob(encoded), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
  }

  // One classic script per task, so the maps also load from file://. A failed load is tried again on a click.
  function showMaps(row) {
    if (!started || row.maps || row.loading) return;
    const task = row.task, source = `${task.id} maps`;
    row.loading = true;
    report(source, "Loading sensitivity maps…");
    new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = task.maps;
      script.async = true;
      script.onerror = () => { script.remove(); reject(new Error("could not be loaded; click the panels to try again")); };
      script.onload = async () => {
        script.remove();
        const encoded = window.BSP_SENSITIVITY_MAPS[task.id];
        delete window.BSP_SENSITIVITY_MAPS[task.id];
        try {
          if (typeof encoded !== "string") throw new Error("are missing from their file");
          if (typeof DecompressionStream === "undefined") throw new Error("cannot be read by this browser; use a current one");
          const bytes = await decompress(encoded).catch(() => { throw new Error("could not be read"); });
          const count = data.series.length, size = task.n_frames * 256;
          if (bytes.length !== count * size) throw new Error("have the wrong size");
          if (data.delta) {  // frames are stored as differences from the previous frame of the same series
            for (let s = 0; s < count; s++) {
              for (let i = s * size + 256; i < (s + 1) * size; i++) bytes[i] = bytes[i] + bytes[i - 256];
            }
          }
          resolve(Array.from({ length: count }, (_, s) => bytes.subarray(s * size, (s + 1) * size)));
        } catch (error) { reject(error); }
      };
      document.head.append(script);
    }).then(result => {
      row.maps = result; row.loading = false; report(source, ""); draw(row);
    }).catch(error => {
      row.loading = false; report(source, `${task.label}: the sensitivity maps ${error.message}.`);
    });
  }

  function drawPanel(ctx, video, map) {
    const pixels = patchImage.data;
    for (let p = 0; p < 256; p++) {
      const b = map[p] * 4;
      pixels[p * 4] = lut[b]; pixels[p * 4 + 1] = lut[b + 1]; pixels[p * 4 + 2] = lut[b + 2]; pixels[p * 4 + 3] = lut[b + 3];
    }
    patchContext.putImageData(patchImage, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    ctx.drawImage(video, 0, 0, data.crop, data.crop);
    ctx.globalAlpha = 0.55;
    ctx.drawImage(patches, 0, 0, data.crop, data.crop);
    ctx.globalAlpha = 1;
  }

  function draw(row) {
    if (!row.maps || row.video.readyState < 2 || row.video.seeking) return;
    const at = row.index * 256;
    row.panels.forEach((ctx, s) => drawPanel(ctx, row.video, row.maps[s].subarray(at, at + 256)));
  }

  function present(row, time) {
    if (row.video.seeking || row.video.readyState < 2) return;
    row.index = Math.min(row.task.n_frames - 1, Math.max(0, Math.floor(time * data.fps + 1e-7)));
    draw(row);
  }

  function schedule(row) {
    const video = row.video;
    if (video.paused) return;
    if (typeof video.requestVideoFrameCallback === "function") {
      if (row.videoCallback !== null) return;
      row.videoCallback = video.requestVideoFrameCallback((_, metadata) => { row.videoCallback = null; present(row, metadata.mediaTime); schedule(row); });
    } else if (row.animation === null) {
      row.animation = requestAnimationFrame(() => { row.animation = null; present(row, video.currentTime); schedule(row); });
    }
  }

  function cancel(row) {
    if (row.videoCallback !== null) row.video.cancelVideoFrameCallback(row.videoCallback);
    if (row.animation !== null) cancelAnimationFrame(row.animation);
    row.videoCallback = row.animation = null;
  }

  // Like the rollout clips, every row loops while the viewer is on screen and waits while it is not, or while the
  // reader stopped it. A press of play starts the rows at once, which also works where the browser held them back.
  function sync(pressed) {
    if (!started) return;
    for (const row of rows) {
      if ((visible || pressed) && !stopped) row.video.play().catch(error => { if (error.name === "NotAllowedError") report("held", HELD); showState(); });
      else row.video.pause();
    }
    showState();
  }

  // The play button shows what the videos are doing, so it offers play wherever they stand still.
  function showState() {
    const paused = rows.every(row => row.video.paused), name = paused ? "Play" : "Pause";
    toggle.setAttribute("aria-pressed", String(paused));
    toggle.setAttribute("aria-label", name);
    toggle.title = name;
    toggle.querySelector("path").setAttribute("d", paused ? "M6.5 4v12l9.5-6z" : "M5.5 4h3v12h-3zm6 0h3v12h-3z");
  }

  // A server without range requests lets a video play but not seek, so it could not loop, and some browsers refuse
  // it outright. The file is then fetched whole, once, and played from memory.
  function seekable(video) {
    const ranges = video.seekable;
    return ranges.length > 0 && ranges.end(ranges.length - 1) >= video.duration - 0.5;
  }
  function refetch(row) {
    if (row.blob !== null || !/^https?:$/.test(location.protocol) || typeof fetch !== "function") return false;
    row.blob = "";
    fetch(row.task.video).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.blob();
    }).then(result => {
      row.blob = URL.createObjectURL(result);
      row.video.src = row.blob;
    }).catch(() => report(`${row.task.id} video`, `${row.task.label}: episode video unavailable.`));
    return true;
  }

  // Nothing downloads until the viewer is close to the screen; then every row's video and maps.
  function start() {
    if (started) return;
    started = true;
    for (const row of rows) { row.video.src = row.task.video; showMaps(row); }
    sync();
  }
  // The one thing a click does: start what the browser held back, and fetch again what failed to load.
  grid.addEventListener("click", event => {
    if (!started || toggle.contains(event.target)) return;   // the play button has its own click
    rows.forEach(showMaps);
    sync();
  });
  toggle.addEventListener("click", () => { stopped = !rows.every(row => row.video.paused); sync(true); });
  lessMotion.addEventListener("change", () => { if (lessMotion.matches) { stopped = true; sync(); } });
  showState();
  if ("IntersectionObserver" in window) {
    const approach = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { approach.disconnect(); start(); }
    }, { rootMargin: "600px 0px" });
    approach.observe(host);
    new IntersectionObserver(entries => {
      visible = entries[entries.length - 1].isIntersecting;
      sync();
    }, { threshold: 0.2 }).observe(grid);
  } else {
    visible = true; start();
  }
})();
