// Data layer: Supabase (shared, live) when configured, otherwise localStorage (demo).
(function () {
  const cfg = window.APP_CONFIG || {};
  const LS_KEY = "ccp.projects.v1";
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
    let data = readLocal();
    if (!data) {
      data = seed();
      try { writeLocal(data); } catch (e) {}
    }
    return data;
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

  function resetDemo() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
  }

  // Demo content so the cloud isn't empty before you connect a database.
  function seed() {
    const now = Date.now();
    const ago = (h) => new Date(now - h * 3600e3).toISOString();
    const rows = [
      ["Prompt Garden", "Grow, prune and share reusable prompts", "Tool", "Maya Levi", "demo-maya", 300],
      ["Shelf Talk", "Ask your bookshelf anything, get citations", "Web app", "Maya Levi", "demo-maya", 120],
      ["Tiny Tutor", "Patient math tutor for kids", "Education", "Noa Ben-David", "demo-noa", 260],
      ["Inbox Zero Agent", "Triages email and drafts polite replies", "Agent", "Dan Cohen", "demo-dan", 240],
      ["Repo Narrator", "Turns git history into a readable story", "Tool", "Dan Cohen", "demo-dan", 90],
      ["Standup Bot", "Writes your daily standup from commits", "Productivity", "Dan Cohen", "demo-dan", 30],
      ["Pixel Dungeon", "Roguelike where Claude is the dungeon master", "Game", "Omer Shapira", "demo-omer", 200],
      ["Figma Critic", "Design feedback on any frame, in seconds", "Art & Design", "Lior Katz", "demo-lior", 180],
      ["Weather MCP", "Forecasts and alerts as an MCP server", "MCP server", "Tamar Azoulay", "demo-tamar", 160],
      ["CSV Whisperer", "Plain-English questions over spreadsheets", "Data", "Yoni Mizrahi", "demo-yoni", 140],
      ["Lesson Builder", "Generates lesson plans and slides together", "Skill / Plugin", "Noa Ben-David", "demo-noa", 60],
      ["Recipe Remix", "Rewrites recipes around what's in your fridge", "Web app", "Gal Peretz", "demo-gal", 100],
      ["Habit Haiku", "Daily check-ins that answer back in haiku", "Productivity", "Shir Avraham", "demo-shir", 50],
    ];
    return rows.map(([title, description, category, creator_name, creator_key, h], i) => ({
      id: "demo-" + i,
      created_at: ago(h),
      title,
      description,
      category,
      creator_name,
      creator_key,
      linkedin: null,
      url: "https://example.com/" + title.toLowerCase().replace(/[^a-z]+/g, "-"),
      thumbnail: null,
      demo: true,
    }));
  }

  window.Store = { mode: remote ? "live" : "demo", list, add, resetDemo };
})();
