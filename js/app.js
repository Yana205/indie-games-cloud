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
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  // ---------- state ----------
  const state = { projects: [], groups: [], byId: new Map(), groupOf: new Map(), cat: "all", q: "" };

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
    el.style.setProperty("--h", hue(p.category));
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
    onProject: (id) => openProject(id),
    onGroup: (gid) => openGroup(gid),
    onDragStart: () => hideTip(),
  });

  // ---------- filters ----------
  function categories() {
    const counts = new Map();
    for (const p of state.projects) {
      const c = p.category || "Other";
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  function renderChips() {
    const cats = categories();
    if (state.cat !== "all" && !cats.some(([c]) => c === state.cat)) state.cat = "all";
    const chip = (val, label, n, h) =>
      `<button type="button" class="chip${state.cat === val ? " on" : ""}" data-cat="${esc(val)}" aria-pressed="${state.cat === val}">` +
      (h != null ? `<i style="--h:${h}"></i>` : "") + `${esc(label)}<small>${n}</small></button>`;
    $("#chips").innerHTML = chip("all", "All", state.projects.length) + cats.map(([c, n]) => chip(c, c, n, hue(c))).join("");
  }

  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    state.cat = b.dataset.cat;
    renderChips();
    applyFilter();
  });

  let qTimer;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.q = normName(e.target.value); applyFilter(); }, 120);
  });

  function applyFilter() {
    const { cat, q } = state;
    if (cat === "all" && !q) return cloud.setFilter(null);
    cloud.setFilter((p) => {
      if (cat !== "all" && (p.category || "Other") !== cat) return false;
      if (q) return normName([p.title, p.description, p.creator_name, p.category].join(" ")).includes(q);
      return true;
    });
  }

  function renderStats() {
    const n = state.projects.length, g = state.groups.length;
    $("#stats").innerHTML =
      `<b>${n}</b> project${n === 1 ? "" : "s"} · <b>${g}</b> builder${g === 1 ? "" : "s"}` +
      (Store.mode === "demo" ? ` <span class="pill" title="Projects are saved in this browser only. Connect Supabase in config.js to go live.">demo</span>` : "");
    $("#empty").hidden = n > 0;
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
    tip.innerHTML = `<b>${esc(p.title)}</b><span>${esc(p.description)}</span>`;
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
  function openDrawer(html) {
    hideTip();
    $("#drawerBody").innerHTML = html;
    $("#drawerBody").scrollTop = 0;
    drawer.classList.add("open");
    scrim.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    $("#drawerClose").focus({ preventScroll: true });
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    scrim.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  }
  $("#drawerClose").addEventListener("click", closeDrawer);
  scrim.addEventListener("click", closeDrawer);
  addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer.classList.contains("open")) closeDrawer(); });
  $("#drawerBody").addEventListener("click", (e) => {
    const b = e.target.closest("[data-open]");
    if (b) { e.preventDefault(); openProject(b.dataset.open); }
    const g = e.target.closest("[data-group]");
    if (g) { e.preventDefault(); openGroup(g.dataset.group); }
  });

  const thumbHTML = (p, cls) => {
    const src = safeImg(p.thumbnail);
    return `<div class="${cls}" style="--h:${hue(p.category)}"><span class="art" style="background:${art(p.title + p.id)}"><span>${esc(initials(p.title))}</span></span>` +
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
      <div><b>${esc(g.name)}</b><small>${g.projects.length} project${g.projects.length === 1 ? "" : "s"} in the cloud</small></div>
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
      <span class="cat" style="--h:${hue(p.category)}"><i></i>${esc(p.category || "Other")}</span>
      <h2>${esc(p.title)}</h2>
      <p class="desc">${esc(p.description)}</p>
      <div class="row">
        ${url ? `<a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open project
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
      <span class="eyebrow">Builder</span>
      ${creatorBlock(g, false)}
      <h3>${g.projects.length} projects</h3>
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
  let chosenCat = null;

  function renderCatPick() {
    const set = new Set([...(cfg.defaultCategories || []), ...categories().map(([c]) => c)]);
    $("#catPick").innerHTML =
      [...set].map((c) => `<button type="button" role="radio" class="chip sm${chosenCat === c ? " on" : ""}" aria-checked="${chosenCat === c}" data-cat="${esc(c)}"><i style="--h:${hue(c)}"></i>${esc(c)}</button>`).join("") +
      `<button type="button" role="radio" class="chip sm new${chosenCat === "__new" ? " on" : ""}" aria-checked="${chosenCat === "__new"}" data-cat="__new">+ New</button>`;
    $("#newCategory").hidden = chosenCat !== "__new";
  }
  $("#catPick").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    chosenCat = chosenCat === b.dataset.cat ? null : b.dataset.cat;
    renderCatPick();
    if (chosenCat === "__new") $("#newCategory").focus();
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

  // Fetch the link's preview (og:image), falling back to a screenshot.
  async function resolveThumb(url) {
    const base = "https://api.microlink.io/?url=" + encodeURIComponent(url);
    try {
      const j = await (await fetch(base)).json();
      const d = j && j.data;
      const img = d && ((d.image && d.image.url) || (d.logo && d.logo.width >= 128 && d.logo.url));
      if (img && safeImg(img)) return img;
      const s = await (await fetch(base + "&screenshot=true&meta=false")).json();
      const shot = s && s.data && s.data.screenshot && s.data.screenshot.url;
      return safeImg(shot);
    } catch (e) {
      return null;
    }
  }

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
    const src = await resolveThumb(url);
    if (id !== thumb.reqId) return;
    thumb.link = src;
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
    chosenCat = null;
    const me = load(ME_KEY) || {};
    form.creator_name.value = me.name || "";
    form.email.value = me.email || "";
    form.linkedin.value = me.linkedin || "";
    $("#formErr").textContent = "";
    $("#wordCount").textContent = "at least 2 words";
    $("#wordCount").classList.remove("ok");
    $("#thumbHint").textContent = "We grab the preview image from your link automatically.";
    status("");
    renderCatPick();
    setPreview();
    closeDrawer();
    dlg.showModal();
    form.title.focus();
  }
  $("#addBtn").addEventListener("click", openForm);
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
    let category = chosenCat === "__new" ? form.newCategory.value.trim() : chosenCat;

    if (!title) return err("Give your project a title.", form.title);
    if (words(description) < 2) return err("The description needs at least 2 words.", form.description);
    if (!url) return err("That link doesn't look right.", form.url);
    if (chosenCat === "__new" && !category) return err("Name your new category, or pick one.", form.newCategory);
    if (!name) return err("Add your full name.", form.creator_name);
    if (email && !form.email.checkValidity()) return err("That email doesn't look right.", form.email);
    if (liRaw && !linkedin) return err("Use a linkedin.com link for LinkedIn.", form.linkedin);
    if (category) {
      // Reuse an existing category if only the casing differs.
      const match = categories().map(([c]) => c).concat(cfg.defaultCategories || [])
        .find((c) => c.toLowerCase() === category.toLowerCase());
      category = match || category;
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
        category: category || "Other",
        creator_name: name,
        creator_key: await emailKey(email),
        linkedin,
        url,
        thumbnail: (thumb.mode === "upload" ? thumb.upload : thumb.link) || null,
      });
      save(ME_KEY, { name, email, linkedin: liRaw });
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
