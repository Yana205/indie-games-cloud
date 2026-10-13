// Data layer: Supabase (shared, live) when configured, otherwise localStorage (local only).
(function () {
  const cfg = window.APP_CONFIG || {};
  const LS_KEY = "ccp.games.v1";
  const remote = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);

  const uid = () =>
    (crypto.randomUUID && crypto.randomUUID()) ||
    "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2);

  function headers(extra) {
    const h = { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" };
    // Legacy anon keys are JWTs and also go in Authorization.
    // New sb_publishable_ keys must only be sent as apikey.
    if (/^eyJ/.test(cfg.supabaseAnonKey)) h.Authorization = "Bearer " + cfg.supabaseAnonKey;
    return Object.assign(h, extra);
  }

  function readLocal() {
    try {
      const data = JSON.parse(localStorage.getItem(LS_KEY));
      if (Array.isArray(data)) return data;
    } catch (e) {}
    return null;
  }

  function writeLocal(data) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data));
    } catch (e) {
      throw new Error("Your browser storage is full. Try a smaller image.");
    }
  }

  async function list() {
    if (remote) {
      const base = cfg.supabaseUrl.replace(/\/$/, "");
      const r = await fetch(base + "/rest/v1/projects?select=*&order=created_at.asc&limit=2000", {
        headers: headers(),
      });
      if (!r.ok) throw new Error("Could not load projects (" + r.status + ")");
      return r.json();
    }
    return readLocal() || [];
  }

  async function add(row) {
    if (remote) {
      const base = cfg.supabaseUrl.replace(/\/$/, "");
      const r = await fetch(base + "/rest/v1/projects", {
        method: "POST",
        headers: headers({ Prefer: "return=representation" }),
        body: JSON.stringify(row),
      });
      if (!r.ok) {
        const text = await r.text();
        // Database not upgraded for edit keys yet: save without one.
        if (/edit_hash/.test(text) && row.edit_hash) {
          const rest = Object.assign({}, row);
          delete rest.edit_hash;
          return add(rest);
        }
        throw new Error("Could not save: " + text);
      }
      const out = await r.json();
      return out[0];
    }
    const saved = Object.assign({}, row, { id: uid(), created_at: new Date().toISOString() });
    const data = readLocal() || [];
    data.push(saved);
    writeLocal(data);
    return saved;
  }

  async function rpc(name, args) {
    const base = cfg.supabaseUrl.replace(/\/$/, "");
    const r = await fetch(base + "/rest/v1/rpc/" + name, { method: "POST", headers: headers(), body: JSON.stringify(args) });
    if (!r.ok) {
      let msg = "";
      try { msg = (await r.json()).message; } catch (e) {}
      throw new Error(r.status === 403 || /edit key/i.test(msg) ? "This device doesn't have the edit key for that game." : msg || "Request failed (" + r.status + ")");
    }
    return r.json();
  }

  // Edit your own game. `token` is the private edit key kept on the creator's device.
  async function update(id, token, data) {
    if (remote) return rpc("update_project", { p_id: id, p_token: token, p_data: data });
    const all = readLocal() || [];
    const i = all.findIndex((p) => p.id === id);
    if (i < 0) throw new Error("Game not found");
    all[i] = Object.assign({}, all[i], data);
    writeLocal(all);
    return all[i];
  }

  async function remove(id, token) {
    if (remote) return rpc("delete_project", { p_id: id, p_token: token });
    writeLocal((readLocal() || []).filter((p) => p.id !== id));
    return true;
  }

  window.Store = { mode: remote ? "live" : "local", list, add, update, remove };
})();
