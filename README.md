# Community Projects Cloud

A single-page site where the Claude community drops its projects into a floating cloud of bubbles.

- **The cloud.** Each project is a bubble that drifts gently. You can drag and fling them.
- **The drop.** When someone adds a project, a droplet falls into the cloud. It splashes, then the new bubble slowly grows and pushes the others aside to make room.
- **Grouped by person.** Projects added with the same email *or* the same full name collect inside one glass bubble for that person.
- **Minimal cards.** Title, a short description (at least 2 words), a category (pick one or make a new one), the creator, the link, and an optional LinkedIn for networking.
- **Thumbnails.** Taken from the link's preview image automatically, or the person uploads a photo.
- **Filter and search** by category, title, description or person.

No build step, no framework: plain HTML, CSS and JavaScript.

## Run it locally

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173. You can also double-click `index.html`.

It starts in **demo mode**: sample projects, and anything you add is saved only in your own browser.

## Go live (shared cloud for everyone)

The site uses [Supabase](https://supabase.com) (free tier is enough) as its database.

1. Create a Supabase project.
2. Open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql), and run it.
3. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key into [`config.js`](config.js):
   ```js
   supabaseUrl: "https://xxxx.supabase.co",
   supabaseAnonKey: "eyJ...",
   ```
4. Deploy the folder to any static host: GitHub Pages, Netlify, Vercel or Cloudflare Pages.

The anon key is meant to be public. The row-level security rules in the schema allow only reading and adding, never editing or deleting. Open pages check for new projects every 20 seconds (see `pollSeconds`), and new ones drop in live.

To remove a project, delete its row in the Supabase table editor.

## How grouping works

- If an email is given, it is hashed (SHA-256) in the browser, and only the hash is stored. The email itself never leaves the visitor's device and is never shown.
- Projects join the same bubble when their email hash matches **or** their full name matches (ignoring case, accents and extra spaces).
- The form remembers your name, email and LinkedIn in your browser, so your next project lands in your bubble automatically.

## Thumbnails

- **From link:** the site asks [microlink.io](https://microlink.io) for the page's preview image (`og:image`). If there isn't one, it asks for a screenshot instead. This sends the project URL to microlink. The free tier allows about 50 lookups a day per visitor IP.
- **Upload:** the image is cropped to a square, resized to 480 px and stored inline (around 40–60 KB). If the community grows large, move uploads to Supabase Storage.
- If neither works, the bubble gets a generated gradient with the project's initials.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page layout, the add-project form and the details drawer |
| `styles.css` | All styling, light and dark themes |
| `config.js` | Supabase keys, categories, polling interval |
| `js/store.js` | Data layer: Supabase, or localStorage in demo mode |
| `js/cloud.js` | Bubble physics, drag, and the drop/splash animation |
| `js/app.js` | Grouping, filters, form, thumbnails, drawer |
| `supabase/schema.sql` | Database table and security rules |

Community-made. Not affiliated with Anthropic.
