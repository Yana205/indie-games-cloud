# Indie Games Cloud

A single-page showcase for the **Claude Code Community Meetup · Indie Game Developers**. Devs drop their games into a floating cloud of bubbles.

Created by Yana Ifraimov.

- **The cloud.** Each game is a bubble that drifts gently. You can drag and fling them.
- **The drop.** When someone adds a game, a droplet falls into the cloud. It splashes, then the new bubble slowly grows and pushes the others aside.
- **Grouped by dev.** Games added with the same email *or* the same full name collect inside one glass bubble for that person.
- **Game details.** Title, a short description (at least 2 words), release status (Released / In development / Prototype, like itch.io), platforms (Mobile, PC, Mac, Web, Console, VR) and genre (pick one or add your own). Plus the creator, the link, and an optional LinkedIn for networking.
- **Covers like WhatsApp link previews.** Paste a link and the site pulls the page's preview image, title and description. itch.io links also pre-select the genre from the game's tags. People can upload their own image instead.
- **Filter** by status, platform or genre, and **search** by title, description or dev.

No build step, no framework: plain HTML, CSS and JavaScript.

## Run it locally

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. You can also double-click `index.html`.

Without a database it runs in **local mode**: anything you add is saved only in your own browser.

## Go live (recommended: Vercel + Supabase, both free)

- **Vercel** hosts the page and runs `api/preview.js`, the WhatsApp-style link preview function.
- **Supabase** stores the games so everyone sees the same cloud.

Both have free tiers that easily cover a meetup. Both also connect to Claude Code: Supabase has an official MCP server, and Vercel has a CLI and an MCP server.

1. **Database.** Create a Supabase project. Open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql), and run it.
2. **Keys.** In Supabase, open **Project Settings → API**. Copy the **Project URL** and the **anon public** key into [`config.js`](config.js).
3. **Host.** Push this repo to GitHub, then import it at vercel.com/new. There's no build step, so keep the defaults.

The anon key is meant to be public. The row-level security rules allow only reading and adding games, never editing or deleting. Open pages check for new games every 20 seconds, and new ones drop in live.

To remove a game, delete its row in the Supabase table editor.

Note: free Supabase projects pause after a week with no traffic. Open the dashboard and press Restore if that happens before the meetup.

**GitHub Pages instead of Vercel?** That works too, but there are no server functions. Link previews then come only from itch.io and microlink.io, the fallback service (about 50 lookups a day per visitor).

## How grouping works

- If an email is given, it is hashed (SHA-256) in the browser, and only the hash is stored. The email itself never leaves the visitor's device and is never shown.
- Projects join the same bubble when their email hash matches **or** their full name matches (ignoring case, accents and extra spaces).
- The form remembers your name, email and LinkedIn in your browser, so your next project lands in your bubble automatically.

## Covers (thumbnails)

When someone pastes a link, the form tries these in order:

1. **itch.io:** reads the game's public `data.json` for its cover, title and tags.
2. **`/api/preview`** (on Vercel): fetches the page on the server and reads its Open Graph tags (`og:image`, `og:title`, `og:description`). This is how WhatsApp, Slack and Discord build link previews. It only fetches public addresses, and results are cached for a day.
3. **Steam:** uses the store's header image.
4. **microlink.io:** a free fallback service.

Upload instead: the image is cropped to a square, resized to 480 px and stored inline (around 40–60 KB). If nothing works, the bubble gets a gradient with the game's initials.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page layout, the add-game form and the details drawer |
| `styles.css` | All styling, light and dark themes |
| `config.js` | Supabase keys, credit, genres, platforms, statuses, polling interval |
| `js/store.js` | Data layer: Supabase, or localStorage in demo mode |
| `js/cloud.js` | Bubble physics, drag, and the drop/splash animation |
| `js/app.js` | Grouping, filters, form, covers, drawer |
| `api/preview.js` | Link preview function (Vercel) |
| `supabase/schema.sql` | Database table and security rules |

Community-made. Not affiliated with Anthropic.
