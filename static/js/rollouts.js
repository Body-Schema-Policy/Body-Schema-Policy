(function () {
  "use strict";
  const data = window.BSP_ROLLOUTS;
  const METHOD_PAGE = {   // the paper or project page of each compared method
    psi0: "https://psi-lab.ai/Psi0/", dp: "https://diffusion-policy.cs.columbia.edu/",
    "rodrigues-network": "https://openreview.net/forum?id=IZHk6BXBST", pi05: "https://www.pi.website/blog/pi05",
    dreamzero: "https://dreamzero0.github.io/", gr00t16: "https://developer.nvidia.com/isaac/gr00t",
    "patch-policy": "https://patch-policy.github.io/" };
  const byId = id => document.getElementById(id);
  if (!data || !byId("rollout-grid")) return;
  const state = { task: data.tasks[0].id, level: 0 };
  const lessMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let visible = false, near = false, stopped = lessMotion.matches;   // stopped by the reader, or for less motion

  function node(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text !== undefined) result.textContent = text;
    return result;
  }

  function videos() {
    return [...document.querySelectorAll("#rollout-grid video, #real-grid video")];   // the simulation tiles and the real-robot clips
  }

  // Clips are only attached once the grid is close to the screen, so opening the page downloads none of them.
  function attach() {
    if (!near) return;
    for (const video of videos()) if (!video.getAttribute("src")) video.src = video.dataset.src;
  }

  // Clips play while the grid is on screen, unless the reader stopped them. A press of play starts them
  // at once, which also works where the browser refuses to start them on its own.
  function play(restart, pressed) {
    for (const video of videos()) {
      if (restart) video.currentTime = 0;
      if ((visible || pressed) && !stopped) video.play().catch(showState);   // autoplay can be refused
      else video.pause();
    }
    showState();
  }

  // The play button shows what the clips are doing, so it offers play wherever they stand still.
  function showState() {
    const paused = videos().every(video => video.paused), name = paused ? "Play" : "Pause";
    toggle.setAttribute("aria-pressed", String(paused));
    toggle.setAttribute("aria-label", name);
    toggle.title = name;
    toggle.querySelector("path").setAttribute("d", paused ? "M6.5 4v12l9.5-6z" : "M5.5 4h3v12h-3zm6 0h3v12h-3z");
  }

  function renderGrid() {
    const task = data.tasks.find(item => item.id === state.task);
    const level = data.levels[state.level];
    byId("rollout-caption").textContent = `${task.name} · ${task.category} · ${level.label}, ${level.name.toLowerCase()} · episode 1 of ${data.episodes_per_level}`;
    const grid = byId("rollout-grid");
    grid.replaceChildren();
    for (const method of data.methods) {
      const tile = node("figure", method.ours ? "rollout-tile is-ours" : "rollout-tile");
      const outcome = method.outcomes[task.id]?.[state.level];
      if (outcome) {
        const video = node("video");
        video.muted = true; video.loop = true; video.playsInline = true; video.preload = "auto";
        video.setAttribute("muted", ""); video.setAttribute("playsinline", "");
        video.setAttribute("aria-label", `${method.label}, ${task.id} ${level.label} episode 1: ${outcome}`);
        video.dataset.src = data.path.replace("<task>", task.id).replace("<level>", state.level).replace("<method>", method.id);
        video.addEventListener("play", showState); video.addEventListener("pause", showState);
        tile.append(video);
      } else {
        tile.append(node("div", "rollout-pending", "Video pending"));
      }
      const caption = node("figcaption");
      // The name links to the method's page; ours has none while the paper is under review.
      const page = METHOD_PAGE[method.id], name = node(page ? "a" : "span", "rollout-name", method.label);
      if (page) { name.href = page; name.target = "_blank"; name.rel = "noopener"; }
      caption.append(name);
      if (outcome) caption.append(node("span", `rollout-badge ${outcome}`, outcome === "success" ? "Success" : "Fail"));
      const count = node("p", "rollout-count", `${method.counts[task.id][state.level]} / ${data.episodes_per_level} at ${level.label}`);
      count.title = `Successes over the ${data.episodes_per_level} ${level.label} episodes (Table 1)`;
      tile.append(caption, count);
      grid.append(tile);
    }
    attach();
    play(false);
  }

  function select(task, level) {
    state.task = task; state.level = level;
    for (const tab of byId("rollout-tasks").children) {
      const selected = tab.dataset.task === task;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const button of byId("rollout-levels").querySelectorAll("[data-level]")) {
      button.setAttribute("aria-pressed", String(Number(button.dataset.level) === level));
    }
    byId("rollout-panel").setAttribute("aria-labelledby", `rollout-task-${task}`);
    renderGrid();
  }

  const tabs = data.tasks.map((task, index) => {
    const tab = node("button", "", task.id);
    tab.type = "button"; tab.id = `rollout-task-${task.id}`; tab.dataset.task = task.id;
    tab.title = `${task.name} · ${task.category}`;
    tab.setAttribute("role", "tab"); tab.setAttribute("aria-controls", "rollout-panel");
    tab.addEventListener("click", () => select(task.id, state.level));
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? data.tasks.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + data.tasks.length) % data.tasks.length;
      tabs[next].focus();
      select(data.tasks[next].id, state.level);
    });
    return tab;
  });
  byId("rollout-tasks").append(...tabs);
  for (const level of data.levels) {
    const button = node("button", "", level.label);
    button.type = "button"; button.dataset.level = level.id; button.title = level.name;
    button.addEventListener("click", () => select(state.task, level.id));
    byId("rollout-levels").append(button);
  }
  const toggle = node("button", "viewer-play");
  toggle.type = "button";
  toggle.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path/></svg>';
  toggle.addEventListener("click", () => { stopped = !videos().every(video => video.paused); play(false, true); });
  byId("rollout-levels").append(toggle);
  for (const video of document.querySelectorAll("#real-grid video")) { video.addEventListener("play", showState); video.addEventListener("pause", showState); }
  lessMotion.addEventListener("change", () => { if (lessMotion.matches) { stopped = true; play(false); } });

  if ("IntersectionObserver" in window) {
    const approach = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      approach.disconnect(); near = true; attach(); play(false);
    }, { rootMargin: "400px 0px" });
    const grids = [byId("rollout-grid"), byId("real-grid")].filter(Boolean), onScreen = new Map();
    for (const grid of grids) approach.observe(grid);
    const watch = new IntersectionObserver(entries => {   // the clips run while either grid is on screen
      for (const entry of entries) onScreen.set(entry.target, entry.isIntersecting);
      visible = [...onScreen.values()].some(Boolean);
      play(false);
    }, { threshold: 0.2 });
    for (const grid of grids) watch.observe(grid);
  } else {
    visible = near = true;
  }
  select(state.task, state.level);
})();
