// The bubble cloud: a tiny physics sim that floats one bubble per creator.
// A creator with several projects becomes a glass bubble holding them all.
(function () {
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const RING = { 2: 0.5, 3: 0.4641, 4: 0.4142, 5: 0.3702, 6: 0.3333 };
  const PAD = 0.84; // inner padding of a group bubble

  // Positions of n equal circles inside a unit circle (x, y, r in -1..1 space).
  function layout(n) {
    if (n <= 0) return [];
    if (n === 1) return [{ x: 0, y: 0, r: 1 }];
    const pts = [];
    if (n <= 6) {
      const rc = RING[n], d = 1 - rc;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        pts.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: rc });
      }
    } else if (n === 7) {
      const rc = 1 / 3;
      pts.push({ x: 0, y: 0, r: rc });
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        pts.push({ x: (Math.cos(a) * 2) / 3, y: (Math.sin(a) * 2) / 3, r: rc });
      }
    } else {
      const k = 0.42 * Math.sqrt(Math.PI / n), rc = k / (1 + k);
      for (let i = 0; i < n; i++) {
        const rad = Math.sqrt((i + 0.5) / n) * (1 - rc), a = i * GOLDEN;
        pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad, r: rc });
      }
    }
    return pts.map((p) => ({ x: p.x * PAD, y: p.y * PAD, r: p.r * PAD * 0.95 }));
  }

  // Relative bubble size for a creator with n projects.
  const sizeFor = (n) => (n <= 1 ? 1 : 0.72 + 0.58 * Math.sqrt(n));

  class Node {
    constructor(cloud, group) {
      this.c = cloud;
      this.id = group.id;
      this.group = group;
      this.pending = new Set();
      this.kids = new Map();
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random());
      this.x = cloud.cx + Math.cos(a) * d * cloud.W * 0.28;
      this.y = cloud.cy + Math.sin(a) * d * cloud.H * 0.2;
      this.vx = this.vy = 0;
      this.r = 0;
      this.tr = 0;
      this.ph = Math.random() * 1000;
      this.holdUntil = 0;
      this.anchorUntil = 0;
      this.falling = false;
      this.drag = false;

      const el = (this.el = document.createElement("div"));
      el.className = "node";
      el.dataset.id = this.id;
      el.innerHTML = '<div class="ring"></div><div class="kids"></div><div class="label"><b dir="auto"></b><span dir="auto"></span></div>';
      this.kidsEl = el.querySelector(".kids");
      this.labelB = el.querySelector(".label b");
      this.labelS = el.querySelector(".label span");
      cloud.stage.appendChild(el);
    }

    visible() {
      return this.group.projects.filter((p) => !this.pending.has(p.id));
    }

    updateTarget() {
      const n = this.visible().length;
      this.tr = n ? this.c.base * this.c.scale * sizeFor(n) : 0;
    }

    render() {
      const vis = this.visible();
      const lay = layout(vis.length);
      const ids = new Set(vis.map((p) => p.id));
      for (const [id, k] of this.kids) {
        if (!ids.has(id)) {
          this.kids.delete(id);
          k.classList.add("leaving");
          setTimeout(() => k.remove(), 450);
        }
      }
      vis.forEach((p, i) => {
        let k = this.kids.get(p.id);
        if (!k) {
          k = this.c.opts.renderProject(p);
          k.classList.add("proj");
          k.dataset.pid = p.id;
          this.kidsEl.appendChild(k);
          this.kids.set(p.id, k);
        }
        const L = lay[i];
        k.style.left = ((L.x - L.r + 1) / 2) * 100 + "%";
        k.style.top = ((L.y - L.r + 1) / 2) * 100 + "%";
        k.style.width = k.style.height = L.r * 100 + "%";
      });
      const group = vis.length > 1;
      this.el.classList.toggle("is-group", group);
      this.el.classList.toggle("is-empty", vis.length === 0);
      if (group) {
        this.labelB.textContent = this.group.name;
        this.labelS.textContent = vis.length + " games";
      } else if (vis[0]) {
        this.labelB.textContent = vis[0].title;
        this.labelS.textContent = vis[0].creator_name;
      }
      this.updateTarget();
    }

    remove(animate) {
      if (!animate) return this.el.remove();
      this.el.classList.add("leaving");
      setTimeout(() => this.el.remove(), 500);
    }
  }

  class Cloud {
    constructor(stage, opts) {
      this.stage = stage;
      this.opts = opts;
      this.nodes = new Map();
      this.drops = [];
      this.base = 56;
      this.scale = 1;
      this.started = false;
      this.resize();
      addEventListener("resize", () => this.resize());
      if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(stage);
      this.bindPointer();
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    resize() {
      this.W = this.stage.clientWidth;
      this.H = this.stage.clientHeight;
      this.top = this.opts.insetTop ? this.opts.insetTop() : 90;
      this.bottom = this.opts.insetBottom ? this.opts.insetBottom() : 90;
      this.cx = this.W / 2;
      this.cy = this.top + (this.H - this.top - this.bottom) / 2;
      this.refit();
    }

    // Pick a bubble scale so the whole cloud fits the screen comfortably.
    refit() {
      let area = 0;
      for (const n of this.nodes.values()) {
        const k = sizeFor(Math.max(1, n.group.projects.length));
        area += Math.PI * k * k;
      }
      // Phones get a sparser cloud and a lower size cap, so bubbles stay small and easy to tell apart.
      const phone = this.W < 600;
      const usable = this.W * Math.max(200, this.H - this.top - this.bottom) * (phone ? 0.16 : 0.3);
      const px = area ? Math.sqrt(usable / area) : this.base;
      this.scale = Math.max(0.3, Math.min(phone ? 0.72 : 1.3, px / this.base));
      for (const n of this.nodes.values()) n.updateTarget();
    }

    // groups: [{id, name, projects:[...]}]. pending: project ids that will drop in later.
    sync(groups, pending = []) {
      if (!this.W) this.resize();
      const pend = new Set(pending);
      const seen = new Set();
      const now = performance.now();
      let i = 0;
      for (const g of groups) {
        let node = this.nodes.get(g.id);
        if (!node) {
          node = new Node(this, g);
          this.nodes.set(g.id, node);
          if (!this.started) { node.holdUntil = now + 40 + i++ * 45; node.grow = 0.11; } // quick staggered intro
        }
        node.group = g;
        for (const p of g.projects) if (pend.has(p.id)) node.pending.add(p.id);
        node.render();
        seen.add(g.id);
      }
      for (const [id, node] of this.nodes) {
        if (!seen.has(id)) { node.remove(true); this.nodes.delete(id); }
      }
      this.started = true;
      this.refit();
      this.applyFilter();
    }

    // Drop the rendered bubbles for these projects so the next sync redraws them with new data.
    invalidate(ids) {
      const set = new Set(ids);
      for (const n of this.nodes.values()) {
        for (const [id, k] of n.kids) if (set.has(id)) { k.remove(); n.kids.delete(id); }
      }
    }

    pendingIds() {
      const out = [];
      for (const n of this.nodes.values()) out.push(...n.pending);
      return out;
    }

    setFilter(fn) {
      this.filter = fn;
      this.applyFilter();
    }

    applyFilter() {
      for (const n of this.nodes.values()) {
        let any = false;
        for (const p of n.visible()) {
          const ok = !this.filter || this.filter(p);
          any = any || ok;
          const k = n.kids.get(p.id);
          if (k) k.classList.toggle("dim", !ok);
        }
        n.el.classList.toggle("dim", !any && n.kids.size > 0);
      }
    }

    // Animate a droplet falling into the bubble that holds project `pid`.
    drop(pid) {
      const node = [...this.nodes.values()].find((n) => n.pending.has(pid));
      if (!node) return;
      if (node.visible().length === 0) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * 0.12;
        node.x = this.cx + Math.cos(a) * d * this.W;
        node.y = this.cy + Math.sin(a) * d * this.H;
        node.r = 0;
      }
      node.falling = true;
      node.vx = node.vy = 0;
      const el = document.createElement("div");
      el.className = "droplet";
      el.innerHTML = "<i></i>";
      this.stage.appendChild(el);
      this.drops.push({ el, node, pid, t0: performance.now(), dur: 1350 });
    }

    land(d) {
      const n = d.node, now = performance.now();
      d.el.remove();
      this.splash(n.x, n.y, Math.max(n.r, 34));
      n.pending.delete(d.pid);
      n.falling = false;
      n.anchorUntil = now + 2600; // the new bubble holds its spot and gently shoulders others aside
      n.render();
      this.refit();
      const kid = n.kids.get(d.pid);
      if (kid) {
        kid.classList.add("enter", "fresh");
        setTimeout(() => kid.classList.remove("enter"), 2000);
        setTimeout(() => kid.classList.remove("fresh"), 6000);
      }
      if (navigator.vibrate && document.visibilityState === "visible" && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) { try { navigator.vibrate([10, 50, 18]); } catch (e) {} }
      n.el.classList.remove("jelly");
      void n.el.offsetWidth;
      n.el.classList.add("jelly");
      // A soft shockwave through nearby bubbles.
      for (const o of this.nodes.values()) {
        if (o === n) continue;
        const dx = o.x - n.x, dy = o.y - n.y, dist = Math.hypot(dx, dy) || 1;
        const reach = 320;
        if (dist < reach) {
          const f = (1 - dist / reach) * 3.2;
          o.vx += (dx / dist) * f;
          o.vy += (dy / dist) * f;
        }
      }
      if (this.opts.onLanded) this.opts.onLanded(d.pid);
    }

    splash(x, y, r) {
      for (let i = 0; i < 3; i++) {
        const rp = document.createElement("div");
        rp.className = "ripple";
        rp.style.left = x + "px";
        rp.style.top = y + "px";
        rp.style.setProperty("--s", r * (2.2 + i * 0.7) + "px");
        rp.style.animationDelay = i * 160 + "ms";
        rp.addEventListener("animationend", () => rp.remove());
        this.stage.appendChild(rp);
      }
      for (let i = 0; i < 9; i++) {
        const s = document.createElement("div");
        s.className = "spark";
        s.style.left = x + "px";
        s.style.top = y + "px";
        this.stage.appendChild(s);
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
        const v = 40 + Math.random() * 70;
        const tx = Math.cos(a) * v, ty = Math.sin(a) * v;
        s.animate(
          [
            { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
            { transform: `translate(calc(-50% + ${tx * 0.7}px), calc(-50% + ${ty}px)) scale(.8)`, opacity: 0.9, offset: 0.45 },
            { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty * 0.2 + 50}px)) scale(.2)`, opacity: 0 },
          ],
          { duration: 900 + Math.random() * 400, easing: "cubic-bezier(.2,.7,.4,1)" }
        ).onfinish = () => s.remove();
      }
    }

    bindPointer() {
      const st = this.stage;
      let drag = null;
      st.addEventListener("pointerdown", (e) => {
        const el = e.target.closest(".node");
        const node = el && this.nodes.get(el.dataset.id);
        if (!node || node.falling) return;
        const kid = e.target.closest(".proj");
        if (kid) kid.classList.add("pressed");
        drag = {
          node, target: e.target, kid, type: e.pointerType, t0: performance.now(), sx: e.clientX, sy: e.clientY,
          ox: node.x - e.clientX, oy: node.y - e.clientY,
          lx: e.clientX, ly: e.clientY, vx: 0, vy: 0, moved: false,
        };
        try { st.setPointerCapture(e.pointerId); } catch (err) {}
      });
      st.addEventListener("pointermove", (e) => {
        if (!drag) return;
        // Fingers wobble, so touch needs a bigger dead zone before a tap becomes a drag.
        const slop = drag.type === "mouse" ? 5 : 12;
        if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > slop) {
          drag.moved = true;
          if (drag.kid) drag.kid.classList.remove("pressed");
          drag.node.drag = true;
          drag.node.el.classList.add("dragging");
          if (this.opts.onDragStart) this.opts.onDragStart();
        }
        if (drag.moved) {
          drag.node.x = e.clientX + drag.ox;
          drag.node.y = e.clientY + drag.oy;
          drag.vx = e.clientX - drag.lx;
          drag.vy = e.clientY - drag.ly;
          drag.lx = e.clientX;
          drag.ly = e.clientY;
        }
      });
      const end = (e, cancelled) => {
        if (!drag) return;
        const { node } = drag;
        if (drag.kid) drag.kid.classList.remove("pressed");
        // A quick, short flick still counts as a tap.
        const quick = performance.now() - drag.t0 < 220 && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 24;
        if (drag.moved && quick && !cancelled) {
          node.drag = false;
          node.el.classList.remove("dragging");
          drag.moved = false;
        }
        if (drag.moved) {
          this.lastDragAt = performance.now();
          node.drag = false;
          node.vx = drag.vx * 0.5;
          node.vy = drag.vy * 0.5;
          node.el.classList.remove("dragging");
        } else if (!cancelled) {
          const kid = drag.target.closest(".proj");
          if (kid) this.opts.onProject(kid.dataset.pid);
          else if (node.visible().length) this.opts.onGroup(node.id);
        }
        drag = null;
      };
      st.addEventListener("pointerup", (e) => end(e, false));
      st.addEventListener("pointercancel", (e) => end(e, true));
      st.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const kid = e.target.closest && e.target.closest(".proj");
        if (kid) { e.preventDefault(); this.opts.onProject(kid.dataset.pid); }
      });
    }

    loop(now) {
      const dt = Math.min(2, (now - (this.last || now)) / 16.67) || 1;
      this.last = now;
      this.step(now, dt);
      this.draw(now);
      requestAnimationFrame(this.loop);
    }

    step(now, dt) {
      const nodes = [...this.nodes.values()];
      // Phones keep the full gap so the title/creator labels under small bubbles don't collide.
      const gap = this.W < 600 ? 30 : 30 * Math.max(0.6, Math.min(1, this.scale));
      // Pull harder along the short side, so a tall phone screen spreads the cloud top to bottom.
      const tall = this.H - this.top - this.bottom > this.W;
      const kx = tall ? 0.0013 : 0.0007, ky = tall ? 0.0007 : 0.0013;
      for (const n of nodes) {
        const target = now < n.holdUntil ? 0 : n.tr;
        n.r += (target - n.r) * Math.min(1, (n.grow || 0.028) * dt); // slow, soft growth (snappier on first load)
        if (Math.abs(target - n.r) < 0.15) { n.r = target; if (target) n.grow = 0; }
        if (n.drag || n.falling) continue;
        n.vx += (this.cx - n.x) * kx * dt;
        n.vy += (this.cy - n.y) * ky * dt;
        n.vx += Math.sin(now * 0.00045 + n.ph) * 0.009 * dt;
        n.vy += Math.cos(now * 0.00037 + n.ph * 1.7) * 0.009 * dt;
      }
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        if (a.r < 2) continue;
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          if (b.r < 2) continue;
          let dx = b.x - a.x, dy = b.y - a.y;
          // Squash vertical distance a little so labels under bubbles get breathing room.
          let d = Math.hypot(dx, dy * 0.8);
          const min = a.r + b.r + gap;
          if (d >= min) continue;
          if (d < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.hypot(dx, dy); }
          const o = (min - d) * 0.5, nx = dx / d, ny = dy / d;
          const fa = a.drag || a.falling || now < a.anchorUntil;
          const fb = b.drag || b.falling || now < b.anchorUntil;
          let wa, wb;
          if (fa && !fb) { wa = 0; wb = 1; }
          else if (fb && !fa) { wa = 1; wb = 0; }
          else { const ma = a.r * a.r, mb = b.r * b.r; wa = mb / (ma + mb); wb = ma / (ma + mb); }
          a.x -= nx * o * wa; a.y -= ny * o * wa;
          b.x += nx * o * wb; b.y += ny * o * wb;
        }
      }
      const damp = Math.pow(0.9, dt);
      for (const n of nodes) {
        if (n.drag || n.falling) continue;
        n.vx *= damp; n.vy *= damp;
        n.x += n.vx * dt; n.y += n.vy * dt;
        const m = 6, minY = this.top + n.r, maxY = this.H - this.bottom - n.r - 28;
        n.x = n.r * 2 + m * 2 > this.W ? this.W / 2 : Math.max(n.r + m, Math.min(this.W - n.r - m, n.x));
        n.y = minY > maxY ? (minY + maxY) / 2 : Math.max(minY, Math.min(maxY, n.y));
      }
    }

    draw(now) {
      for (const n of this.nodes.values()) {
        const r = Math.max(0, n.r);
        n.el.style.transform = `translate3d(${n.x - r}px, ${n.y - r}px, 0)`;
        // Resizing forces layout, so only touch width/height when the size really changed.
        if (n.drawnR === undefined || Math.abs(n.drawnR - r) > 0.25) {
          n.drawnR = r;
          n.el.style.width = n.el.style.height = 2 * r + "px";
        }
        const tiny = r < 30;
        if (tiny !== n.tiny) { n.tiny = tiny; n.el.classList.toggle("tiny", tiny); }
      }
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i];
        const p = Math.min(1, (now - d.t0) / d.dur);
        const e = p * p * p; // accelerate like a falling drop
        const y = -60 + (d.node.y + 60) * e;
        const stretch = 1 + e * 0.55;
        d.el.style.transform = `translate3d(${d.node.x}px, ${y}px, 0) scale(${1 / Math.sqrt(stretch)}, ${stretch})`;
        if (p >= 1) { this.drops.splice(i, 1); this.land(d); }
      }
    }
  }

  window.Cloud = Cloud;
})();
