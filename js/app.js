(function () {
  const cfg = window.APP_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const ME_KEY = "ccp.me.v1";

  // ---------- helpers ----------
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const normName = (s) =>
    String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const hashStr = (s) => {
    let h = 2166136261;
    for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const hue = (s) => hashStr(String(s || "other").toLowerCase()) % 360;
  const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
  const initials = (t) =>
    String(t || "?").trim().split(/\s+/).slice(0, 2).map((w) => [...w][0] || "").join("").toUpperCase() || "?";
  const art = (seed) => {
    const h = hashStr(seed) % 360, h2 = (h + 30 + (hashStr(seed + "~") % 90)) % 360;
    return `radial-gradient(circle at 28% 22%, hsl(${h2} 85% 72% / .9), transparent 55%), linear-gradient(145deg, hsl(${h} 58% 46%), hsl(${(h + 320) % 360} 52% 22%))`;
  };
  const safeUrl = (u) => {
    if (!u) return null;
    let s = String(u).trim();
    if (!/^[a-z]+:\/\//i.test(s)) s = "https://" + s;
    try {
      const x = new URL(s);
      return /^https?:$/.test(x.protocol) && x.hostname.includes(".") ? x.href : null;
    } catch (e) { return null; }
  };
  const safeImg = (u) =>
    typeof u === "string" && (/^https:\/\//.test(u) || /^data:image\/(png|jpe?g|webp|gif);base64,/.test(u)) ? u : null;
  const safeLinkedIn = (u) => {
    const s = safeUrl(u);
    return s && /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\//i.test(s) ? s.replace(/^http:/, "https:") : null;
  };
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const ago = (iso) => {
    const s = (new Date(iso).getTime() - Date.now()) / 1000;
    const steps = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"], [Infinity, "year"]];
    let v = s;
    for (const [n, unit] of steps) {
      if (Math.abs(v) < n) return rtf.format(Math.round(v), unit);
      v /= n;
    }
  };
  async function emailKey(email) {
    const e = String(email || "").trim().toLowerCase();
    if (!e) return null;
    const data = "ccp:" + e;
    if (crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
    }
    return "h" + hashStr(data).toString(16) + hashStr(data + "#").toString(16);
  }
  const buzz = () => { try { if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(8); } catch (e) {} };
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  // ---------- state ----------
  const state = { projects: [], groups: [], byId: new Map(), groupOf: new Map(), status: null, platform: null, genre: null, q: "" };

  // ---------- game fields ----------
  const STATUS_HUE = { Released: 145, "In development": 36, Prototype: 265 };
  const statusHue = (s) => (s in STATUS_HUE ? STATUS_HUE[s] : 200);
  const platformsOf = (p) => (Array.isArray(p.platforms) ? p.platforms.filter(Boolean) : []);
  const PLATFORM_ICON = {
    Mobile: '<rect x="4.5" y="1.5" width="7" height="13" rx="1.5"/><path d="M7 12.5h2"/>',
    PC: '<rect x="1.5" y="2.5" width="13" height="8.5" rx="1"/><path d="M5.5 14h5M8 11v3"/>',
    Mac: '<rect x="2.5" y="2.5" width="11" height="7.5" rx="1"/><path d="M1 13h14"/>',
    Web: '<circle cx="8" cy="8" r="6.5"/><path d="M1.5 8h13M8 1.5c2 2 2.6 4 2.6 6.5S10 12.5 8 14.5M8 1.5C6 3.5 5.4 5.5 5.4 8S6 12.5 8 14.5"/>',
    Console: '<path d="M4.5 4.5h7a3.5 3.5 0 0 1 3.4 4.3l-.6 2.6a1.8 1.8 0 0 1-3.1.8L9.8 10.5H6.2l-1.4 1.7a1.8 1.8 0 0 1-3.1-.8l-.6-2.6a3.5 3.5 0 0 1 3.4-4.3Z"/><path d="M4.5 7v2M3.5 8h2"/>',
    VR: '<path d="M2 5.5h12a.5.5 0 0 1 .5.5v4a1.5 1.5 0 0 1-1.5 1.5h-2.6L8.8 9.6a1 1 0 0 0-1.6 0L5.6 11.5H3A1.5 1.5 0 0 1 1.5 10V6a.5.5 0 0 1 .5-.5Z"/>',
  };
  const platformIcon = (name) =>
    `<svg viewBox="0 0 16 16" aria-hidden="true">${PLATFORM_ICON[name] || '<rect x="2.5" y="2.5" width="11" height="11" rx="2"/>'}</svg>`;

  // Group projects by creator: same email OR same normalized full name end up together.
  function groupProjects(list) {
    const sorted = [...list].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const idx = new Map(sorted.map((p, i) => [p.id, i]));
    const parent = new Map(sorted.map((p) => [p.id, p.id]));
    const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
    const union = (a, b) => {
      a = find(a); b = find(b);
      if (a === b) return;
      if (idx.get(a) < idx.get(b)) parent.set(b, a); else parent.set(a, b);
    };
    const first = new Map();
    for (const p of sorted) {
      const n = normName(p.creator_name);
      for (const k of [p.creator_key && "e:" + p.creator_key, n && "n:" + n]) {
        if (!k) continue;
        if (first.has(k)) union(first.get(k), p.id); else first.set(k, p.id);
      }
    }
    const groups = new Map();
    for (const p of sorted) {
      const root = find(p.id);
      if (!groups.has(root)) groups.set(root, { id: root, projects: [] });
      groups.get(root).projects.push(p);
    }
    return [...groups.values()].map((g) => {
      const rev = [...g.projects].reverse();
      // Display the spelling used most often (ties go to the most recent).
      const tally = new Map();
      for (const p of rev) tally.set(p.creator_name, (tally.get(p.creator_name) || 0) + 1);
      g.name = rev.map((p) => p.creator_name).reduce((best, n) => (tally.get(n) > tally.get(best) ? n : best));
      g.linkedin = rev.map((p) => safeLinkedIn(p.linkedin)).find(Boolean) || null;
      return g;
    });
  }

  function rebuild() {
    state.byId = new Map(state.projects.map((p) => [p.id, p]));
    state.groups = groupProjects(state.projects);
    state.groupOf = new Map();
    for (const g of state.groups) for (const p of g.projects) state.groupOf.set(p.id, g);
  }

  // ---------- bubbles ----------
  function renderProject(p) {
    const el = document.createElement("div");
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `${p.title} by ${p.creator_name}`);
    el.style.setProperty("--h", statusHue(p.status));
    const a = document.createElement("span");
    a.className = "art";
    a.style.background = art(p.title + p.id);
    a.innerHTML = `<span>${esc(initials(p.title))}</span>`;
    el.appendChild(a);
    const src = safeImg(p.thumbnail);
    if (src) {
      const img = new Image();
      img.alt = "";
      img.draggable = false;
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      img.onload = () => img.classList.add("ok");
      img.onerror = () => img.remove();
      img.src = src;
      el.appendChild(img);
    }
    el.insertAdjacentHTML("beforeend", '<i class="gloss"></i>');
    return el;
  }

  const cloud = new window.Cloud($("#stage"), {
    renderProject,
    insetTop: () => $("#top").offsetHeight + 10,
    insetBottom: () => $("#bottom").offsetHeight + 10,
    onProject: (id) => { buzz(); openProject(id); },
    onGroup: (gid) => { buzz(); openGroup(gid); },
    onDragStart: () => hideTip(),
  });

  // ---------- filters ----------
  function tally(values) {
    const counts = new Map();
    for (const v of values) if (v) counts.set(v, (counts.get(v) || 0) + 1);
    return counts;
  }
  // Configured values first (in config order), then any custom ones by popularity.
  function ordered(counts, preset) {
    const pre = (preset || []).filter((v) => counts.has(v)).map((v) => [v, counts.get(v)]);
    const extra = [...counts.entries()].filter(([v]) => !(preset || []).includes(v)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return pre.concat(extra);
  }
  const facets = () => ({
    status: ordered(tally(state.projects.map((p) => p.status)), cfg.statuses),
    platform: ordered(tally(state.projects.flatMap(platformsOf)), cfg.platforms),
    genre: ordered(tally(state.projects.map((p) => p.genre)), cfg.genres),
  });
  const genres = () => facets().genre.map(([g]) => g);

  function renderChips() {
    const f = facets();
    for (const k of ["status", "platform", "genre"]) {
      if (state[k] && !f[k].some(([v]) => v === state[k])) state[k] = null;
    }
    const none = !state.status && !state.platform && !state.genre;
    const chip = (facet, val, n, mark) => {
      const on = facet === "all" ? none : state[facet] === val;
      return `<button type="button" class="chip${on ? " on" : ""}" data-facet="${facet}" data-val="${esc(val)}" aria-pressed="${on}">${mark || ""}${esc(val)}<small>${n}</small></button>`;
    };
    const group = (facet, list, mark) =>
      list.length ? '<span class="chip-sep" aria-hidden="true"></span>' + list.map(([v, n]) => chip(facet, v, n, mark(v))).join("") : "";
    $("#chips").innerHTML =
      chip("all", "All", state.projects.length) +
      group("status", f.status, (v) => `<i style="--h:${statusHue(v)}"></i>`) +
      group("platform", f.platform, (v) => platformIcon(v)) +
      group("genre", f.genre, (v) => `<i class="sq" style="--h:${hue(v)}"></i>`);
  }

  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    const { facet, val } = b.dataset;
    if (facet === "all") state.status = state.platform = state.genre = null;
    else state[facet] = state[facet] === val ? null : val;
    renderChips();
    applyFilter();
  });

  let qTimer;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = normName(e.target.value); applyFilter(); }, 120);
  });

  function applyFilter() {
    const { status, platform, genre, q } = state;
    if (!status && !platform && !genre && !q) return cloud.setFilter(null);
    cloud.setFilter((p) => {
      if (status && p.status !== status) return false;
      if (platform && !platformsOf(p).includes(platform)) return false;
      if (genre && p.genre !== genre) return false;
      if (q) return normName([p.title, p.description, p.creator_name, p.genre, p.status, ...platformsOf(p)].join(" ")).includes(q);
      return true;
    });
  }

  function renderStats() {
    const n = state.projects.length, g = state.groups.length;
    $("#stats").innerHTML =
      `<b>${n}</b> game${n === 1 ? "" : "s"} · <b>${g}</b> dev${g === 1 ? "" : "s"}` +
      (Store.mode === "local" ? ` <span class="pill" title="Games are saved in this browser only. Connect Supabase in config.js so everyone shares one cloud.">local</span>` : "");
    $("#empty").hidden = n > 0;
  }

  function renderCredit() {
    const c = cfg.credit;
    if (!c || !c.name) return;
    const li = safeLinkedIn(c.linkedin);
    const name = li
      ? `<a href="${esc(li)}" target="_blank" rel="noopener noreferrer">${esc(c.name)}<svg viewBox="0 0 16 16" aria-label="LinkedIn" class="fill"><path d="M3.6 5.8h-2v8.6h2V5.8ZM2.6 1.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm11.8 7.6c0-2.3-1.2-3.5-3-3.5-1.3 0-2 .7-2.3 1.2v-1h-2v8.6h2V10c0-1.2.3-2.3 1.7-2.3s1.6 1.3 1.6 2.4v4.3h2V9.2Z"/></svg></a>`
      : `<b>${esc(c.name)}</b>`;
    $("#credit").innerHTML = `Created by ${name}${c.event ? ` for the ${esc(c.event)}` : ""}`;
  }

  function refreshUI() {
    renderChips();
    renderStats();
    applyFilter();
  }

  // ---------- tooltip ----------
  const tip = $("#tip");
  function hideTip() { tip.hidden = true; }
  $("#stage").addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const kid = e.target.closest(".proj");
    if (!kid) return hideTip();
    const p = state.byId.get(kid.dataset.pid);
    if (!p) return hideTip();
    const meta = [p.status, p.genre, platformsOf(p).join(", ")].filter(Boolean).join(" · ");
    tip.innerHTML = `<b>${esc(p.title)}</b><span>${esc(p.description)}</span>${meta ? `<em style="--h:${statusHue(p.status)}">${esc(meta)}</em>` : ""}`;
    tip.hidden = false;
  });
  $("#stage").addEventListener("pointermove", (e) => {
    if (tip.hidden) return;
    const x = Math.min(innerWidth - tip.offsetWidth - 12, e.clientX + 14);
    tip.style.transform = `translate(${x}px, ${e.clientY + 18}px)`;
  });
  $("#stage").addEventListener("pointerleave", hideTip);

  // ---------- drawer ----------
  const drawer = $("#drawer"), scrim = $("#scrim");
  // Sheets (drawer + form) add one history entry, so the phone's Back button closes them.
  const sheet = { pushed: false };
  const drawerOpen = () => drawer.classList.contains("open");
  function sheetOpened() {
    if (!sheet.pushed) { history.pushState({ ccpSheet: 1 }, ""); sheet.pushed = true; }
  }
  function sheetClosed() {
    if (sheet.pushed && !drawerOpen() && !dlg.open) { sheet.pushed = false; history.back(); }
  }
  addEventListener("popstate", () => {
    if (!sheet.pushed) return;
    sheet.pushed = false;
    if (drawerOpen()) closeDrawer();
    if (dlg.open) dlg.close();
  });

  function openDrawer(html) {
    hideTip();
    $("#drawerBody").innerHTML = html;
    $("#drawerBody").scrollTop = 0;
    drawer.style.transform = "";
    drawer.classList.add("open");
    scrim.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    drawer.openedAt = performance.now();
    if (matchMedia("(hover: hover)").matches) $("#drawerClose").focus({ preventScroll: true });
    sheetOpened();
  }
  function closeDrawer() {
    if (!drawerOpen()) return;
    drawer.classList.remove("open");
    scrim.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    drawer.style.transform = "";
    sheetClosed();
  }
  $("#drawerClose").addEventListener("click", closeDrawer);
  // On touch screens the browser sends a late "click" right after the tap that opened the
  // drawer; it lands on the scrim, so ignore scrim taps for a moment after opening.
  scrim.addEventListener("click", () => {
    if (performance.now() - (drawer.openedAt || 0) > 450) closeDrawer();
  });

  // Swipe the sheet down to close it (phones).
  (() => {
    let s = null;
    const grab = $("#drawerGrab");
    grab.addEventListener("pointerdown", (e) => {
      s = { y: e.clientY, t: performance.now(), dy: 0, id: e.pointerId };
      try { grab.setPointerCapture(e.pointerId); } catch (err) {}
      drawer.classList.add("dragging");
    });
    grab.addEventListener("pointermove", (e) => {
      if (!s) return;
      s.dy = Math.max(0, e.clientY - s.y);
      drawer.style.transform = `translateY(${s.dy}px)`;
    });
    const end = () => {
      if (!s) return;
      const v = s.dy / Math.max(1, performance.now() - s.t);
      drawer.classList.remove("dragging");
      if (s.dy > 110 || (v > 0.5 && s.dy > 30)) closeDrawer();
      else drawer.style.transform = "";
      s = null;
    };
    grab.addEventListener("pointerup", end);
    grab.addEventListener("pointercancel", end);
  })();
  addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer.classList.contains("open")) closeDrawer(); });
  $("#drawerBody").addEventListener("click", (e) => {
    const b = e.target.closest("[data-open]");
    if (b) { e.preventDefault(); openProject(b.dataset.open); }
    const g = e.target.closest("[data-group]");
    if (g) { e.preventDefault(); openGroup(g.dataset.group); }
  });

  const thumbHTML = (p, cls) => {
    const src = safeImg(p.thumbnail);
    return `<div class="${cls}" style="--h:${statusHue(p.status)}"><span class="art" style="background:${art(p.title + p.id)}"><span>${esc(initials(p.title))}</span></span>` +
      (src ? `<img src="${esc(src)}" alt="" referrerpolicy="no-referrer" onload="this.classList.add('ok')" onerror="this.remove()">` : "") + `</div>`;
  };
  const linkedinBtn = (url) =>
    url ? `<a class="btn btn-ghost btn-sm" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 16 16" aria-hidden="true" class="fill"><path d="M3.6 5.8h-2v8.6h2V5.8ZM2.6 1.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm11.8 7.6c0-2.3-1.2-3.5-3-3.5-1.3 0-2 .7-2.3 1.2v-1h-2v8.6h2V10c0-1.2.3-2.3 1.7-2.3s1.6 1.3 1.6 2.4v4.3h2V9.2Z"/></svg>
      Connect on LinkedIn</a>` : "";
  const card = (p) =>
    `<a class="mini" href="#" data-open="${esc(p.id)}">${thumbHTML(p, "mini-thumb")}<span><b>${esc(p.title)}</b><small>${esc(p.description)}</small></span></a>`;

  function creatorBlock(g, current) {
    return `<div class="creator">
      <div class="avatar" style="background:${art(g.name)}">${esc(initials(g.name))}</div>
      <div><b>${esc(g.name)}</b><small>${g.projects.length} game${g.projects.length === 1 ? "" : "s"} in the cloud</small></div>
      ${current ? `<a href="#" class="link-sm" data-group="${esc(g.id)}">View all</a>` : ""}
    </div>${linkedinBtn(g.linkedin)}`;
  }

  function openProject(id) {
    const p = state.byId.get(id);
    if (!p) return;
    const g = state.groupOf.get(id);
    const url = safeUrl(p.url);
    const others = g ? g.projects.filter((x) => x.id !== id).reverse() : [];
    openDrawer(`
      ${thumbHTML(p, "hero")}
      <div class="tags">
        ${p.status ? `<span class="cat" style="--h:${statusHue(p.status)}"><i></i>${esc(p.status)}</span>` : ""}
        ${p.genre ? `<span class="cat" style="--h:${hue(p.genre)}"><i class="sq"></i>${esc(p.genre)}</span>` : ""}
        ${platformsOf(p).map((x) => `<span class="cat plat">${platformIcon(x)}${esc(x)}</span>`).join("")}
      </div>
      <h2>${esc(p.title)}</h2>
      <p class="desc">${esc(p.description)}</p>
      <div class="row">
        ${url ? `<a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${p.status === "Released" ? "Play" : "Open"} game
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 11 11 5M6 5h5v5"/></svg></a>` : ""}
        <span class="when">added ${esc(ago(p.created_at))}</span>
      </div>
      <h3>Made by</h3>
      ${g ? creatorBlock(g, others.length > 0) : ""}
      ${others.length ? `<h3>More from ${esc(g.name.split(" ")[0])}</h3><div class="minis">${others.map(card).join("")}</div>` : ""}
    `);
  }

  function openGroup(gid) {
    const g = state.groups.find((x) => x.id === gid);
    if (!g) return;
    if (g.projects.length === 1) return openProject(g.projects[0].id);
    openDrawer(`
      <span class="eyebrow">Game dev</span>
      ${creatorBlock(g, false)}
      <h3>${g.projects.length} games</h3>
      <div class="minis">${[...g.projects].reverse().map(card).join("")}</div>
    `);
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3600);
  }

  // ---------- add form ----------
  const dlg = $("#addDialog"), form = $("#addForm");
  const thumb = { mode: "link", link: null, upload: null, reqId: 0 };
  const pick = { status: null, platforms: new Set(), genre: null };

  const pickChip = (kind, val, on, mark, role = "radio") =>
    `<button type="button" role="${role}" class="chip sm${on ? " on" : ""}" aria-${role === "radio" ? "checked" : "pressed"}="${on}" data-kind="${kind}" data-val="${esc(val)}">${mark || ""}${esc(val)}</button>`;

  function renderPickers() {
    $("#statusPick").innerHTML = (cfg.statuses || []).map((v) =>
      pickChip("status", v, pick.status === v, `<i style="--h:${statusHue(v)}"></i>`)).join("");
    const plats = [...new Set([...(cfg.platforms || []), ...state.projects.flatMap(platformsOf)])];
    $("#platformPick").innerHTML = plats.map((v) =>
      pickChip("platform", v, pick.platforms.has(v), platformIcon(v), "checkbox")).join("");
    const gs = [...new Set([...(cfg.genres || []), ...genres()])];
    $("#genrePick").innerHTML = gs.map((v) =>
      pickChip("genre", v, pick.genre === v, `<i class="sq" style="--h:${hue(v)}"></i>`)).join("") +
      pickChip("genre", "+ New", pick.genre === "__new", "").replace('data-val="+ New"', 'data-val="__new"').replace('class="chip sm', 'class="chip sm new');
    $("#newGenre").hidden = pick.genre !== "__new";
  }
  form.addEventListener("click", (e) => {
    const b = e.target.closest(".cat-pick .chip");
    if (!b) return;
    const { kind, val } = b.dataset;
    if (kind === "platform") pick.platforms.has(val) ? pick.platforms.delete(val) : pick.platforms.add(val);
    else pick[kind] = pick[kind] === val ? null : val;
    renderPickers();
    if (kind === "genre" && pick.genre === "__new") $("#newGenre").focus();
  });

  function setPreview() {
    const src = thumb.mode === "upload" ? thumb.upload : thumb.link;
    const title = form.title.value.trim() || "?";
    $("#thumbArt").style.background = art(title);
    $("#thumbArt").innerHTML = `<span>${esc(initials(title))}</span>`;
    const img = $("#thumbImg");
    if (src) {
      if (img.getAttribute("src") !== src) { img.classList.remove("ok"); img.src = src; }
      img.hidden = false;
    } else {
      img.hidden = true;
      img.removeAttribute("src");
    }
    $("#thumbPreview").classList.toggle("has-img", !!src);
  }
  $("#thumbImg").addEventListener("load", (e) => e.target.classList.add("ok"));
  $("#thumbImg").addEventListener("error", (e) => {
    e.target.hidden = true;
    if (thumb.mode === "link") { thumb.link = null; status("No preview found"); }
  });
  const status = (t) => { $("#thumbStatus").textContent = t || ""; };

  // itch.io exposes /data.json (cover, title, tags) with CORS enabled.
  async function itchInfo(url) {
    const u = new URL(url);
    if (!/\.itch\.io$/i.test(u.hostname) || u.pathname.split("/").filter(Boolean).length !== 1) return null;
    try {
      const r = await fetch(u.origin + u.pathname.replace(/\/$/, "") + "/data.json");
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  // Find a cover for the link, like WhatsApp's link previews:
  // itch.io directly, then our own /api/preview (Vercel), then microlink as a fallback.
  async function resolveThumb(url) {
    const itch = await itchInfo(url);
    if (itch && safeImg(itch.cover_image)) return { img: itch.cover_image, title: itch.title, tags: itch.tags || [] };
    // /api/preview only exists when hosted on Vercel; static hosts like GitHub Pages skip it.
    if (!/\.github\.io$/.test(location.hostname) && location.protocol !== "file:") try {
      const r = await fetch("api/preview?url=" + encodeURIComponent(url));
      const j = r.ok && /json/.test(r.headers.get("content-type") || "") ? await r.json() : null;
      if (j && safeImg(j.image)) return { img: j.image, title: j.title, description: j.description };
    } catch (e) {}
    const steam = url.match(/^https?:\/\/store\.steampowered\.com\/app\/(\d+)/i);
    if (steam) return { img: `https://cdn.cloudflare.steamstatic.com/steam/apps/${steam[1]}/header.jpg` };
    const base = "https://api.microlink.io/?url=" + encodeURIComponent(url);
    try {
      const j = await (await fetch(base)).json();
      if (!j || j.status !== "success") return null; // blocked or unreachable: don't screenshot a bot wall
      const d = j.data || {};
      const img = (d.image && d.image.url) || (d.logo && d.logo.width >= 128 && d.logo.url);
      if (img && safeImg(img)) return { img, title: d.title, description: d.description };
      const s = await (await fetch(base + "&screenshot=true&meta=false")).json();
      return { img: safeImg(s && s.data && s.data.screenshot && s.data.screenshot.url), title: d.title, description: d.description };
    } catch (e) {
      return null;
    }
  }

  // Store pages add noise like "Save 75% on X on Steam" or "X by Studio"; keep it short.
  const cleanTitle = (t) =>
    String(t || "").replace(/^Save \d+% on /i, "").replace(/ on Steam$/i, "").replace(/ (by|[-–|·]) .*$/, "").trim().slice(0, 60);
  const clip = (t, n) => {
    t = String(t || "").replace(/\s+/g, " ").trim();
    if (t.length <= n) return t;
    return t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…";
  };

  let linkTimer;
  form.url.addEventListener("input", () => {
    clearTimeout(linkTimer);
    linkTimer = setTimeout(fetchLinkThumb, 700);
  });
  async function fetchLinkThumb() {
    const url = safeUrl(form.url.value);
    if (!url || thumb.lastUrl === url) return;
    thumb.lastUrl = url;
    const id = ++thumb.reqId;
    thumb.link = null;
    if (thumb.mode === "link") { status("Fetching preview…"); setPreview(); }
    const info = await resolveThumb(url);
    if (id !== thumb.reqId) return;
    const src = (info && info.img) || null;
    thumb.link = src;
    // Pre-fill what the link tells us, only where the person hasn't typed yet.
    if (info && info.title && !form.title.value.trim()) {
      form.title.value = cleanTitle(info.title);
      setPreview();
    }
    if (info && info.description && !form.description.value.trim()) {
      form.description.value = clip(info.description, 140);
      form.description.dispatchEvent(new Event("input"));
    }
    if (info && info.tags) {
      if (!pick.genre) {
        const tags = info.tags.map((t) => String(t).toLowerCase().replace(/-/g, " "));
        const g = (cfg.genres || []).find((x) => tags.includes(x.toLowerCase()));
        if (g) { pick.genre = g; renderPickers(); }
      }
    }
    if (thumb.mode === "link") { status(src ? "" : "No preview found"); setPreview(); }
  }

  form.addEventListener("change", (e) => {
    if (e.target.name !== "thumbMode") return;
    thumb.mode = e.target.value;
    $("#thumbHint").textContent = thumb.mode === "link"
      ? "We grab the preview image from your link automatically."
      : thumb.upload ? "Looks good. Click the bubble to swap it." : "Pick an image. We'll crop it into a bubble.";
    status(thumb.mode === "upload" && !thumb.upload ? "Click to upload" : thumb.mode === "link" && !thumb.link && form.url.value ? "No preview found" : "");
    setPreview();
    if (thumb.mode === "upload" && !thumb.upload) $("#thumbFile").click();
    if (thumb.mode === "link") fetchLinkThumb();
  });
  $("#thumbPreview").addEventListener("click", () => {
    if (thumb.mode === "upload") $("#thumbFile").click();
  });
  $("#thumbFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      thumb.upload = await compress(f);
      status("");
      $("#thumbHint").textContent = "Looks good. Click the bubble to swap it.";
      setPreview();
    } catch (err) {
      status("Couldn't read that image");
    }
  });

  function compress(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height), out = Math.min(480, side);
        const c = document.createElement("canvas");
        c.width = c.height = out;
        c.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
      img.src = url;
    });
  }

  form.title.addEventListener("input", setPreview);
  form.description.addEventListener("input", () => {
    const n = words(form.description.value);
    const wc = $("#wordCount");
    wc.textContent = n >= 2 ? `${n} words` : "at least 2 words";
    wc.classList.toggle("ok", n >= 2);
  });

  function openForm() {
    form.reset();
    Object.assign(thumb, { mode: "link", link: null, upload: null, lastUrl: null, reqId: thumb.reqId + 1 });
    const me = load(ME_KEY) || {};
    pick.status = null;
    pick.genre = null;
    pick.platforms = new Set(me.platforms || []);
    form.creator_name.value = me.name || "";
    form.email.value = me.email || "";
    form.linkedin.value = me.linkedin || "";
    $("#formErr").textContent = "";
    $("#wordCount").textContent = "at least 2 words";
    $("#wordCount").classList.remove("ok");
    $("#thumbHint").textContent = "We grab the preview image from your link automatically.";
    status("");
    renderPickers();
    setPreview();
    dlg.showModal();
    closeDrawer();
    sheetOpened();
    // On phones, don't pop the keyboard up over the form right away.
    if (matchMedia("(hover: hover)").matches) form.title.focus();
  }
  $("#addBtn").addEventListener("click", openForm);
  dlg.addEventListener("close", sheetClosed);
  dlg.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]") || e.target === dlg) dlg.close();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = (msg, field) => {
      $("#formErr").textContent = msg;
      if (field) field.focus();
    };
    const title = form.title.value.trim();
    const description = form.description.value.trim().replace(/\s+/g, " ");
    const url = safeUrl(form.url.value);
    const name = form.creator_name.value.trim().replace(/\s+/g, " ");
    const email = form.email.value.trim();
    const liRaw = form.linkedin.value.trim();
    const linkedin = liRaw ? safeLinkedIn(liRaw) : null;
    let genre = pick.genre === "__new" ? form.newGenre.value.trim().replace(/\s+/g, " ") : pick.genre;

    if (!title) return err("Give your project a title.", form.title);
    if (words(description) < 2) return err("The description needs at least 2 words.", form.description);
    if (!url) return err("That link doesn't look right.", form.url);
    if (!pick.status) return err("Pick a release status.", $("#statusPick .chip"));
    if (pick.genre === "__new" && !genre) return err("Name the new genre, or pick one.", form.newGenre);
    if (!name) return err("Add your full name.", form.creator_name);
    if (email && !form.email.checkValidity()) return err("That email doesn't look right.", form.email);
    if (liRaw && !linkedin) return err("Use a linkedin.com link for LinkedIn.", form.linkedin);
    if (genre) {
      // Reuse an existing genre if only the casing differs.
      const match = (cfg.genres || []).concat(genres()).find((g) => g.toLowerCase() === genre.toLowerCase());
      genre = match || genre;
    }

    const btn = $("#submitBtn");
    btn.disabled = true;
    btn.textContent = "Dropping…";
    try {
      // If the link preview is still loading, give it a moment.
      if (thumb.mode === "link" && safeUrl(form.url.value) !== thumb.lastUrl) await fetchLinkThumb();
      const row = await Store.add({
        title,
        description,
        status: pick.status,
        platforms: (cfg.platforms || []).filter((x) => pick.platforms.has(x)).concat([...pick.platforms].filter((x) => !(cfg.platforms || []).includes(x))),
        genre: genre || null,
        creator_name: name,
        creator_key: await emailKey(email),
        linkedin,
        url,
        thumbnail: (thumb.mode === "upload" ? thumb.upload : thumb.link) || null,
      });
      save(ME_KEY, { name, email, linkedin: liRaw, platforms: [...pick.platforms] });
      dlg.close();
      addAndDrop([row]);
    } catch (ex) {
      err(ex.message || "Something went wrong. Try again.");
    } finally {
      btn.disabled = false;
      btn.textContent = "Drop it in";
    }
  });

  // Add rows to the cloud, dropping them in one after another.
  function addAndDrop(rows) {
    rows = rows.filter((r) => r && !state.byId.has(r.id));
    if (!rows.length) return;
    state.projects.push(...rows);
    rebuild();
    cloud.sync(state.groups, [...cloud.pendingIds(), ...rows.map((r) => r.id)]);
    refreshUI();
    rows.forEach((r, i) => setTimeout(() => cloud.drop(r.id), 350 + i * 1700));
  }

  // ---------- boot ----------
  async function boot() {
    try {
      state.projects = await Store.list();
    } catch (e) {
      state.projects = [];
      toast(e.message);
    }
    rebuild();
    renderCredit();
    cloud.sync(state.groups);
    refreshUI();
    if (Store.mode === "live") {
      setInterval(async () => {
        try {
          const all = await Store.list();
          addAndDrop(all.filter((p) => !state.byId.has(p.id)));
        } catch (e) {}
      }, Math.max(5, cfg.pollSeconds || 20) * 1000);
    }
  }

  window.CCP = { cloud, state, toast };
  boot();
})();
