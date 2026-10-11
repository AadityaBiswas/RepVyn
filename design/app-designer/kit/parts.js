// Repeated parts of the mockups, filled in before device.js adds the phone chrome.
// <div data-part="strip"></div>, "seg12", "nav" (data-on="today"), "rows" (data-n, data-theme).
(() => {
  const svg = (d, s = 22, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" class="ico" style="stroke-width:${w}" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    today: '<path d="M7 7v10M17 7v10M3.5 9.5v5M20.5 9.5v5M7 12h10"/>',
    body: '<circle cx="12" cy="5" r="2.2"/><path d="M6 9.5c2 .8 4 1.2 6 1.2s4-.4 6-1.2M12 10.7V15M12 15l-3 5.5M12 15l3 5.5"/>',
    progress: '<path d="M4 19.5h16M6.5 15l3.500-4 3 2.500L17.500 7"/><path d="M14 7h3.500v3.500"/>',
    profile: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1.200-3.200 3.800-4.800 7-4.800s5.800 1.600 7 4.800"/>',
    check: '<path d="M5 12.5l4.500 4.500L19 7.500"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    more: '<path d="M6 12h.01M12 12h.01M18 12h.01"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    minus: '<path d="M6 12h12"/>',
    plus: '<path d="M12 6v12M6 12h12"/>',
    play: '<path d="M8 4.500v15l12-7.500z" fill="currentColor" stroke="none"/>',
  };
  window.icon = (n, s, w) => svg(ICONS[n], s, w);

  // Sat 10 Oct, week 3. Mon legs (hard), Wed pull (light), Thu push (medium).
  const WEEK = [["M", 5, "w3"], ["T", 6, "rest"], ["W", 7, "w1"], ["T", 8, "w2"], ["F", 9, "rest"], ["S", 10, "today"], ["S", 11, "up"]];
  const PLAN = [
    ["Split squat", "3 sets · 10 reps each side", "quads"],
    ["Single-leg RDL", "3 sets · 8 reps each side", "hamstrings"],
    ["Glute bridge", "3 sets · 15 reps", "glutes"],
    ["Single-leg calf raise", "3 sets · 12 reps each side", "calves"],
    ["Plank", "3 sets · 40 sec", "abs"],
  ];
  const TABS = [["today", "Today"], ["body", "Body"], ["progress", "Progress"], ["profile", "Profile"]];

  const parts = {
    seg12: () => Array.from({ length: 12 }, (_, i) => `<i class="${i < 2 ? "d" : i === 2 ? "n" : ""}"></i>`).join(""),
    strip: (el) => WEEK.map(([l, d, k]) => {
      const kind = el.dataset.done && k === "today" ? "w2" : k;
      return `<div class="cap ${kind}"><b>${l}</b><span>${/^w/.test(kind) ? svg(ICONS.check, 16, 3) : d}</span></div>`;
    }).join(""),
    nav: (el) => TABS.map(([k, l]) => `<button type="button" class="press${k === el.dataset.on ? " on" : ""}" aria-label="${l}">${svg(ICONS[k])}${k === el.dataset.on ? l : ""}</button>`).join(""),
    rows: (el) => PLAN.slice(0, +el.dataset.n || 5).map(([n, d, m]) =>
      `<div class="row"><img src="img/thumb-${m}-${el.dataset.theme || "light"}.png" alt=""><div><strong>${n}</strong><small>${d}</small></div>${el.dataset.more ? `<button type="button" class="more press" aria-label="More for ${n}">${svg(ICONS.more, 22, 2.6)}</button>` : ""}</div>`).join(""),
  };
  for (const el of document.querySelectorAll("[data-part]")) {
    el.classList.add(el.dataset.part);
    el.innerHTML = parts[el.dataset.part](el);
  }
  for (const el of document.querySelectorAll("[data-icon]")) el.innerHTML = svg(ICONS[el.dataset.icon], +el.dataset.s || 22, +el.dataset.w || 2) + el.innerHTML;
})();
