(function () {
  "use strict";
  const byId = id => document.getElementById(id);

  const burger = document.querySelector(".navbar-burger");
  burger.addEventListener("click", () => {
    const expanded = burger.getAttribute("aria-expanded") !== "true";
    burger.setAttribute("aria-expanded", String(expanded));
    burger.setAttribute("aria-label", expanded ? "Close navigation" : "Open navigation");
    burger.classList.toggle("is-active", expanded);
    byId("nav-menu").classList.toggle("is-active", expanded);
  });
  for (const link of byId("nav-menu").querySelectorAll("a")) {
    link.addEventListener("click", () => {
      burger.classList.remove("is-active");
      burger.setAttribute("aria-expanded", "false");
      burger.setAttribute("aria-label", "Open navigation");
      byId("nav-menu").classList.remove("is-active");
    });
  }

  // The switch itself is CSS; this only starts loading the figures it hides once the reader reaches for it.
  for (const options of document.querySelectorAll(".figure-switch")) {
    const preload = () => {
      for (const image of options.closest(".figure-set").querySelectorAll('img[loading="lazy"]')) image.loading = "eager";
    };
    options.addEventListener("pointerenter", preload, { once: true });
    options.addEventListener("focusin", preload, { once: true });
  }

  const copyButton = byId("copy-bibtex");  // absent while the BibTeX section is commented out
  if (copyButton) copyButton.addEventListener("click", async () => {
    const text = byId("bibtex-code").textContent;
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (_) { /* Fall back for local files or clipboard-denied browsers. */ }
    if (!copied) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(byId("bibtex-code"));
      selection.removeAllRanges(); selection.addRange(range);
      try { copied = document.execCommand("copy"); } catch (_) { copied = false; }
    }
    byId("copy-status").textContent = copied ? "Copied." : "Citation selected. Press Ctrl+C or ⌘C to copy.";
  });
})();
