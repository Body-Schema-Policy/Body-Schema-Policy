/* Denoising from noise: the action estimate after each DDPM iteration, for three denoisers on one frame, played in a loop
   beside the demonstration. */
(function () {
  "use strict";
  const data = window.BSP_DENOISING;
  const host = document.getElementById("denoising");
  if (!data || !host) return;
  const task = data.tasks[0];   // the page shows one task
  const lessMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let started = false, visible = false, loading = false, steps = null, plot = null;
  let frame = 0, shown = null, clock = 0, previous = null, request = null, paused = false, holding = false;
  window.BSP_DENOISING_STEPS = window.BSP_DENOISING_STEPS || Object.create(null);

  // The strokes of the paper's figure, given there in points on a 30.567 pt panel, in crop pixels here.
  const PT = data.crop / 30.567;
  const STYLE = { ink: "#0b0b0b", next: 0.7 * PT, outline: 1.25 * PT, outlineAlpha: 0.55, later: 0.35 * PT, laterAlpha: 0.3,
                  demo: 0.3 * PT, demoAlpha: 0.95 };
  const FRAME = 75, HOLD = 10;                        // milliseconds a frame; a frame per iteration, then the last one held 0.75 s
  const FRAMES = data.iterations + HOLD;
  const SET = data.actions * data.points * 2;         // numbers in one chunk of skeletons
  const SHORT_NAME = { bsp: "ours", unetpool: "U-Net", rodpool: "Rodrigues" };   // curve names on the chart
  const RANGE = [0.05, 50];                           // degrees on the chart's log axis; every curve lies inside
  const NS = "http://www.w3.org/2000/svg";

  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }
  function shape(tag, attributes, text) {
    const result = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes)) result.setAttribute(name, value);
    if (text !== undefined) result.textContent = text;
    return result;
  }

  const player = node("div", "denoising-player");
  const head = node("div", "denoising-head");   // the title, with the play button at the end of its line
  const title = node("p", "denoising-title"); title.setAttribute("aria-hidden", "true");
  const toggle = node("button", "viewer-play"), icon = shape("svg", { viewBox: "0 0 20 20", "aria-hidden": "true" }), glyph = shape("path", {});
  toggle.type = "button";
  icon.append(glyph); toggle.append(icon); head.append(title, toggle);
  const grid = node("div", "denoising-grid");
  const legend = node("div", "denoising-legend");
  const chartTitle = node("p", "denoising-chart-title", "Whole-body error of the next action against the demonstration, log scale.");
  const chartHost = node("div", "denoising-chart");
  const chart = shape("svg", { role: "img" });
  chartHost.append(chart);
  const status = node("p", "episode-status"); status.setAttribute("role", "status");
  player.append(head, grid, legend, chartTitle, chartHost, status);
  host.append(player);

  // A panel: its name, beside a key when it has a curve in the chart, a pill under the name, and the canvas.
  function panel(className, key, label, pill, about) {
    const figure = node("figure", className), caption = node("figcaption");
    const name = node("span", "denoising-name", label);
    if (key) name.prepend(node("i", `arm-key ${key}`));
    caption.append(name, pill);
    const media = node("div", "episode-media");
    const canvas = node("canvas"); canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", about);
    media.append(canvas);
    figure.append(caption, media);
    grid.append(figure);
    return { canvas, context: canvas.getContext("2d") };
  }
  const panels = data.arms.map((arm, i) => {
    const error = node("span", "denoising-pill denoising-error is-off"), value = node("span");
    error.title = "Whole-body error of the next action against the demonstration";
    error.append(node("span", "error-label", "whole body"), value);
    return { ...panel(i === 0 ? "denoising-panel is-ours" : "denoising-panel", `arm-${i}`, arm.label, error,
                      `${arm.label}: its action estimate after each denoising iteration, over the head-camera view`), error, value };
  });
  // The fourth panel is what the estimates are scored against: the demonstration's own chunk, the same at every iteration.
  const truth = panel("denoising-panel is-truth", null, "Demonstration", node("span", "denoising-pill", "ground truth"),
                      `Demonstration: the ${data.actions} actions of its chunk, the ground truth, over the head-camera view`);
  // One legend entry per limb group and chunk part, keyed in the group's colour at the part's weight, then the demonstration.
  for (const group of task.groups) {   // only the limb groups that enter this frame
    for (const [className, part] of [["key-line is-next", "next action"], ["key-line is-later", "future actions"]]) {
      const item = node("span", "", `${data.groups[group].label}, ${part}`), key = node("i", className);
      key.style.background = data.groups[group].color;
      item.prepend(key); legend.append(item);
    }
  }
  const demoKey = node("span", "", "demonstration");
  demoKey.prepend(node("i", "key-line is-demo")); legend.append(demoKey);

  async function decompress(encoded) {
    const binary = atob(encoded), bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
  }

  // int16 points in 1/scale crop pixel: [arm][iteration][action][point][x, y], then the demonstration's chunk.
  async function decode(payload) {
    if (!payload || typeof payload.xy !== "string") throw new Error("The denoising steps are missing from their file.");
    if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot read the denoising steps. Use a current browser.");
    const bytes = await decompress(payload.xy).catch(() => { throw new Error("The denoising steps could not be read."); });
    const arm = data.iterations * SET, demo = data.arms.length * arm, count = demo + SET;
    if (bytes.length !== 2 * count) throw new Error("The denoising steps have the wrong size.");
    const values = new Int16Array(count);
    for (let i = 0; i < count; i++) values[i] = bytes[2 * i] | bytes[2 * i + 1] << 8;   // little-endian
    for (let a = 0; a < data.arms.length; a++) {   // an iteration is stored as its difference from the one before
      for (let i = a * arm + SET; i < (a + 1) * arm; i++) values[i] += values[i - SET];
    }
    const xy = new Float32Array(count);
    for (let i = 0; i < count; i++) xy[i] = values[i] === data.far ? NaN : values[i] / data.scale;
    // Points too far out for int16 come with their exact position; null is a point behind the camera.
    for (const [point, x, y] of payload.far) { xy[2 * point] = x === null ? NaN : x; xy[2 * point + 1] = y === null ? NaN : y; }
    return { xy, demo, body: payload.body_deg };
  }

  // The steps come as a classic script, so they also load from file://. A failed load is tried again on a click.
  function load() {
    if (!started || steps || loading) return;
    loading = true;
    status.textContent = "Loading denoising steps…";
    const points = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = task.steps;
      script.async = true;
      script.onerror = () => { script.remove(); reject(new Error("The denoising steps could not be loaded. Click the panels to try again.")); };
      script.onload = () => {
        script.remove();
        const payload = window.BSP_DENOISING_STEPS[task.id];
        delete window.BSP_DENOISING_STEPS[task.id];
        decode(payload).then(resolve, reject);
      };
      document.head.append(script);
    });
    const image = new Promise((resolve, reject) => {
      const picture = new Image();
      picture.onload = () => resolve(picture);
      picture.onerror = () => reject(new Error("The frame image could not be loaded. Click the panels to try again."));
      picture.src = task.image;
    });
    Promise.all([points, image]).then(([result, picture]) => {
      steps = { ...result, image: picture }; loading = false; status.textContent = "";
      panels.forEach((target, i) => target.canvas.setAttribute("aria-label",
        `${data.arms[i].label}: its action estimate after each of ${data.iterations} denoising iterations, over the head-camera view with the demonstration in white. `
        + `Whole-body error of the next action after the last iteration: ${degrees(steps.body[i][data.iterations - 1])}.`));
      resize();
      sync();
    }).catch(error => {
      loading = false; status.textContent = error.message;
    });
  }

  // Each limb is stroked on its own, so translucent strokes build up where they cross.
  function strokeLimbs(ctx, xy, base, color) {
    for (const [parent, child, group] of data.edges) {
      const x0 = xy[base + 2 * parent], y0 = xy[base + 2 * parent + 1], x1 = xy[base + 2 * child], y1 = xy[base + 2 * child + 1];
      if (!(x0 === x0 && y0 === y0 && x1 === x1 && y1 === y1)) continue;   // an end behind the camera: not drawn
      ctx.strokeStyle = color || data.groups[group].color;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
  }
  function frameImage(target) {
    const ctx = target.context, size = target.canvas.width, [left, right, bottom, top] = data.extent;
    ctx.setTransform(size / data.crop, 0, 0, size / data.crop, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, data.crop, data.crop);
    // The frame sits a fraction of a pixel off the projection's grid; a first copy fills the sliver that leaves bare.
    ctx.drawImage(steps.image, 0, 0, data.crop, data.crop);
    ctx.drawImage(steps.image, left, top, right - left, bottom - top);
    ctx.lineCap = ctx.lineJoin = "round";
    return ctx;
  }
  // A chunk of 16 actions as in the paper's figure: the later actions light, then the next action solid with a
  // dark edge. Under an iterate's next action goes the demonstration's, a thin white line.
  function drawChunk(ctx, base, under) {
    const xy = steps.xy;
    ctx.globalAlpha = STYLE.laterAlpha; ctx.lineWidth = STYLE.later;
    for (let action = 1; action < data.actions; action++) strokeLimbs(ctx, xy, base + action * data.points * 2);
    if (under !== undefined) {
      ctx.globalAlpha = STYLE.demoAlpha; ctx.lineWidth = STYLE.demo;
      strokeLimbs(ctx, xy, under, "#ffffff");
    }
    ctx.globalAlpha = STYLE.outlineAlpha; ctx.lineWidth = STYLE.outline;
    strokeLimbs(ctx, xy, base, STYLE.ink);
    ctx.globalAlpha = 1; ctx.lineWidth = STYLE.next;
    strokeLimbs(ctx, xy, base);
  }

  function degrees(value) {
    return `${value.toFixed(2)}°`;
  }

  // A loop is every iteration in turn, then the last one held. The demonstration's panel never changes, so it is
  // drawn only when the canvases are sized.
  function draw(again) {
    if (!steps) return;
    const k = Math.min(data.iterations, frame + 1);
    if (k === shown && !again) return;
    shown = k;
    title.textContent = `iteration ${k}/${data.iterations}`;
    if (again) drawChunk(frameImage(truth), steps.demo);
    panels.forEach((target, arm) => {
      drawChunk(frameImage(target), (arm * data.iterations + k - 1) * SET, steps.demo);
      target.value.textContent = degrees(steps.body[arm][k - 1]);
      target.error.classList.remove("is-off");
    });
    if (plot) {
      plot.line.setAttribute("x1", plot.x(k)); plot.line.setAttribute("x2", plot.x(k));
      plot.dots.forEach((dot, arm) => { dot.setAttribute("cx", plot.x(k)); dot.setAttribute("cy", plot.y(steps.body[arm][k - 1])); });
    }
  }

  // The error beside each name, against the iteration, on a log axis; the cursor is at the iteration on show.
  // The labels take their size from the stylesheet, and the chart's margins follow it.
  function drawChart() {
    const em = parseFloat(getComputedStyle(chart).fontSize) || 10;
    const width = Math.max(260, Math.round(chartHost.clientWidth)), height = Math.round((width < 520 ? 124 : 170) + 3.6 * em);
    const left = Math.round(3.4 * em + 6), right = width - Math.round(5.4 * em + 12), top = 10, bottom = height - Math.round(2.9 * em + 7);   // room for the curve names
    const x = k => left + (k - 1) / (data.iterations - 1) * (right - left);
    const y = value => top + Math.log(RANGE[1] / value) / Math.log(RANGE[1] / RANGE[0]) * (bottom - top);
    chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
    chart.style.height = `${height}px`;
    chart.replaceChildren();
    plot = null;
    for (const value of [0.1, 1, 10]) {
      chart.append(shape("line", { class: "grid", x1: left, x2: right, y1: y(value), y2: y(value) }),
                   shape("text", { x: left - 8, y: y(value) + 0.35 * em, "text-anchor": "end" }, `${value}°`));
    }
    chart.append(shape("line", { class: "axis", x1: left, x2: right, y1: bottom, y2: bottom }));
    for (const k of [1, 25, 50, 75, 100]) {
      chart.append(shape("line", { class: "axis", x1: x(k), x2: x(k), y1: bottom, y2: bottom + 4 }),
                   shape("text", { x: x(k), y: bottom + 1.25 * em + 3.5, "text-anchor": "middle" }, String(k)));
    }
    chart.append(shape("text", { x: (left + right) / 2, y: height - 3, "text-anchor": "middle" }, "denoising iteration"));
    const about = `Whole-body error of the next action against denoising iteration on ${task.label}, log scale.`;
    chart.setAttribute("aria-label", about);
    if (!steps) return;
    const last = data.arms.map((arm, i) => `${arm.label} ${degrees(steps.body[i][data.iterations - 1])}`);
    chart.setAttribute("aria-label", `${about} After the last iteration: ${last.join(", ")}.`);
    data.arms.forEach((arm, i) => {
      chart.append(shape("polyline", { class: `curve arm-${i}`, points: steps.body[i].map((value, j) => `${x(j + 1).toFixed(1)},${y(value).toFixed(1)}`).join(" ") }));
    });
    // Each curve is named at its right end, in its colour; names are pushed apart when two ends sit close.
    const ends = data.arms.map((arm, i) => ({ i, y: y(steps.body[i][data.iterations - 1]) })).sort((a, b) => a.y - b.y);
    for (let n = 1; n < ends.length; n++) ends[n].y = Math.max(ends[n].y, ends[n - 1].y + 1.15 * em);
    for (const end of ends) {
      chart.append(shape("text", { class: `curve-label arm-${end.i}`, x: right + 10, y: end.y + 0.35 * em },
                         SHORT_NAME[data.arms[end.i].id] || data.arms[end.i].label));
    }
    const line = shape("line", { class: "cursor", y1: top, y2: bottom });
    const dots = data.arms.map((arm, i) => shape("circle", { class: `cursor-dot arm-${i}`, r: em < 12 ? 4 : 5 }));
    chart.append(line, ...dots);
    plot = { x, y, line, dots };
  }

  // The loop's clock runs only while it is drawn, so it carries on from where it was after a wait.
  function animate(now) {
    if (previous !== null) clock += Math.min(now - previous, 250);
    previous = now;
    frame = Math.floor(clock / FRAME) % FRAMES;
    // On the end hold the loop stands still, so the button shows play; a press then restarts the loop at once.
    if ((frame >= data.iterations) !== holding) { holding = !holding; paintGlyph(holding); }
    draw();
    request = requestAnimationFrame(animate);
  }
  // Like the rollout clips, the loop runs while the viewer is on screen and waits while it is not, or while paused.
  function sync() {
    const run = visible && steps !== null && !paused;
    if (run && request === null) { previous = null; request = requestAnimationFrame(animate); }
    else if (!run && request !== null) { cancelAnimationFrame(request); request = null; }
  }

  // A pause stops the loop where it is, and play carries on from there. The button's glyph and name say what a
  // press does.
  function setPaused(value) {
    paused = value;
    sync();
    const name = paused ? "Play" : "Pause";
    toggle.setAttribute("aria-pressed", String(paused));
    toggle.setAttribute("aria-label", name);
    toggle.title = name;
    holding = false; paintGlyph(paused);
  }
  // Shows iteration k and pauses on it.
  function hold(k) {
    frame = Math.max(1, Math.min(data.iterations, k)) - 1;
    clock = frame * FRAME;
    setPaused(true);
    draw();
  }
  // A press on the chart, or a drag along it, holds the iteration under the pointer.
  function seek(event) {
    const x = new DOMPoint(event.clientX, event.clientY).matrixTransform(chart.getScreenCTM().inverse()).x;
    hold(Math.round(1 + (x - plot.x(1)) / (plot.x(data.iterations) - plot.x(1)) * (data.iterations - 1)));
  }

  // Canvases are drawn at the screen's own resolution, so the strokes stay sharp at any panel size.
  function resize() {
    const ratio = window.devicePixelRatio || 1;
    for (const target of [...panels, truth]) {
      const size = Math.max(1, Math.round(target.canvas.getBoundingClientRect().width * ratio));
      if (target.canvas.width !== size) target.canvas.width = target.canvas.height = size;
    }
    drawChart();
    draw(true);
  }

  // Nothing downloads until the viewer is close to the screen; then the steps and the frame.
  function start() {
    if (started) return;
    started = true;
    load();
  }
  grid.addEventListener("click", load);   // the one thing a click does: fetch again what failed to load
  function paintGlyph(play) { glyph.setAttribute("d", play ? "M6.5 4v12l9.5-6z" : "M5.5 4h3v12h-3zm6 0h3v12h-3z"); }
  toggle.addEventListener("click", () => {
    if (!paused && holding) { clock = 0; frame = 0; holding = false; paintGlyph(false); draw(); return; }
    setPaused(!paused);
  });
  toggle.addEventListener("keydown", event => {   // the arrow keys step one iteration
    if (!steps || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    hold(shown + (event.key === "ArrowRight" ? 1 : -1));
  });
  chart.addEventListener("pointerdown", event => {
    if (!plot || event.button !== 0) return;
    chart.setPointerCapture(event.pointerId);
    seek(event);
  });
  chart.addEventListener("pointermove", event => { if (plot && chart.hasPointerCapture(event.pointerId)) seek(event); });
  // With less motion asked for, the loop starts paused on its last iteration, the converged estimate.
  if (lessMotion.matches) hold(data.iterations); else setPaused(false);
  lessMotion.addEventListener("change", () => { if (lessMotion.matches) setPaused(true); });
  drawChart();
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(grid);
  else window.addEventListener("resize", resize);
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
