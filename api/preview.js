// Link preview, the way WhatsApp and Slack do it: fetch the page on the server
// and read its Open Graph tags (og:image, og:title, og:description).
// Runs as a Vercel serverless function at /api/preview?url=...
const dns = require("dns").promises;
const net = require("net");

const MAX_BYTES = 600 * 1024;
const TIMEOUT_MS = 6000;
const UA = "Mozilla/5.0 (compatible; IndieGamesCloudPreview/1.0; link preview)";

function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l.startsWith("::ffff:")) return isPrivateIp(l.slice(7));
    return l === "::" || l === "::1" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

// Only public http(s) hosts, so the function can't be used to reach internal networks.
async function assertPublic(u) {
  if (!/^https?:$/.test(u.protocol)) throw new Error("bad protocol");
  if (u.username || u.password) throw new Error("credentials not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("private host");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("private host");
}

async function fetchHtml(start) {
  let url = new URL(start);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        redirect: "manual",
        signal: ctrl.signal,
        headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        url = new URL(r.headers.get("location"), url);
        continue;
      }
      if (!r.ok) throw new Error("status " + r.status);
      if (!/html/i.test(r.headers.get("content-type") || "")) throw new Error("not html");
      // Read only the start of the page; the meta tags live in <head>.
      const reader = r.body.getReader();
      const chunks = [];
      let size = 0;
      while (size < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
        if (Buffer.concat(chunks).toString("utf8").includes("</head>")) break;
      }
      reader.cancel().catch(() => {});
      return { html: Buffer.concat(chunks).toString("utf8"), url };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("too many redirects");
}

const decode = (s) =>
  String(s || "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ").trim();

function meta(html, names) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const name of names) {
    for (const tag of tags) {
      const key = (tag.match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i) || [])[1];
      if (key && key.toLowerCase() === name) {
        const content = (tag.match(/\bcontent\s*=\s*"([^"]*)"/i) || tag.match(/\bcontent\s*=\s*'([^']*)'/i) || [])[1];
        if (content) return decode(content);
      }
    }
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader("content-type", "application/json; charset=utf-8");
  try {
    const target = new URL(req.url, "http://local").searchParams.get("url");
    if (!target || target.length > 500) throw new Error("missing url");
    const { html, url } = await fetchHtml(target);
    let image = meta(html, ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src", "image"]);
    if (!image) {
      const link = html.match(/<link\b[^>]*rel=["'](?:image_src|apple-touch-icon)["'][^>]*>/i);
      image = link && decode((link[0].match(/href=["']([^"']+)["']/i) || [])[1]);
    }
    if (image) {
      image = new URL(image, url).href.replace(/^http:/, "https:");
      if (!/^https:\/\//.test(image)) image = null;
    }
    const titleTag = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1];
    res.setHeader("cache-control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).send(JSON.stringify({
      image: image || null,
      title: meta(html, ["og:title", "twitter:title"]) || decode(titleTag) || null,
      description: meta(html, ["og:description", "twitter:description", "description"]),
      site: meta(html, ["og:site_name"]),
    }));
  } catch (e) {
    res.status(200).send(JSON.stringify({ image: null, error: String(e.message || e) }));
  }
};
