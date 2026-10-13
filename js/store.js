// Data layer: Supabase (shared, live) when configured, otherwise localStorage (local only).
(function () {
  const cfg = window.APP_CONFIG || {};
  const LS_KEY = "ccp.games.v1";
  const remote = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);

  const uid = () =>
    (crypto.randomUUID && crypto.randomUUID()) ||
    "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2);

  function headers(extra) {
    return Object.assign(
      {
        apikey: cfg.supabaseAnonKey,
        Authorization: "Bearer " + cfg.supabaseAnonKey,
        "Content-Type": "application/json",
      },
      extra
    );
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
      if (!r.ok) throw new Error("Could not save: " + (await r.text()));
      const out = await r.json();
      return out[0];
    }
    const saved = Object.assign({}, row, { id: uid(), created_at: new Date().toISOString() });
    const data = readLocal() || [];
    data.push(saved);
    writeLocal(data);
    return saved;
  }

  window.Store = { mode: remote ? "live" : "local", list, add };
})();
