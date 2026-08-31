import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { request as httpsRequest } from "node:https";

export type WebSearchResult = { title: string; url: string; description: string };
export type ScrapedPage = { url: string; title: string | null; text: string; truncated: boolean };

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  if (normalized.includes(":")) {
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd")
      || /^fe[89ab]/.test(normalized) || normalized.startsWith("2001:db8:");
  }
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224
    || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
    || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19));
}

type ResolvedPublicUrl = { url: URL; address: string; family: 4 | 6 };

async function resolvePublicUrl(rawUrl: string): Promise<ResolvedPublicUrl> {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Only public HTTP/HTTPS URLs are allowed");
  if ((url.protocol === "http:" && url.port && url.port !== "80") || (url.protocol === "https:" && url.port && url.port !== "443")) {
    throw new Error("Non-standard ports are not allowed");
  }
  if (url.hostname === "localhost" || url.hostname.endsWith(".local") || isIP(url.hostname) && isPrivateAddress(url.hostname)) {
    throw new Error("Private network URLs are not allowed");
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("URL resolves to a private network");
  return { url, address: addresses[0].address, family: addresses[0].family as 4 | 6 };
}

function fetchPinnedText(target: ResolvedPublicUrl): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const requestFn = target.url.protocol === "https:" ? httpsRequest : httpRequest;
    const request = requestFn(target.url, {
      method: "GET",
      headers: { Accept: "text/html, text/plain;q=0.9", "User-Agent": "TinyPersonal-Hub/1.0" },
      lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
    }, (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 1_000_000) {
          response.destroy(new Error("Page is too large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
      response.on("error", reject);
    });
    request.setTimeout(12_000, () => request.destroy(new Error("Page request timed out")));
    request.on("error", reject);
    request.end();
  });
}

function decodeHtml(value: string): string {
  return value.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function htmlToText(html: string): { title: string | null; text: string } {
  const titleMatch = html.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1];
  const clean = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { title: titleMatch ? decodeHtml(titleMatch.replace(/<[^>]+>/g, " ").trim()) : null, text: decodeHtml(clean) };
}

async function searchWebFallback(query: string, count = 5): Promise<WebSearchResult[]> {
  try {
    const targetUrl = "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query);
    const response = await fetch(targetUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const html = await response.text();
    const snippets = [...html.matchAll(/<a class="result__snippet"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
    const results: WebSearchResult[] = [];
    for (const match of snippets) {
      if (results.length >= count) break;
      let rawUrl = match[1];
      if (rawUrl.includes("uddg=")) {
        const urlMatch = rawUrl.match(/uddg=([^&]+)/);
        if (urlMatch) rawUrl = decodeURIComponent(urlMatch[1]);
      }
      if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
        rawUrl = "https:" + (rawUrl.startsWith("//") ? rawUrl : "//" + rawUrl);
      }
      const desc = decodeHtml(match[2].replace(/<[^>]+>/g, "").trim());
      let title = "";
      try { title = new URL(rawUrl).hostname; } catch { title = rawUrl; }
      if (rawUrl && desc) {
        results.push({ title, url: rawUrl, description: desc });
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function searchWeb(query: string, count = 5): Promise<WebSearchResult[]> {
  try {
    const baseUrl = process.env.SEARXNG_BASE_URL ?? "http://127.0.0.1:8080";
    const url = new URL("/search", baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("language", "auto");
    url.searchParams.set("safesearch", "1");
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "TinyPersonal-Hub/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) {
      const payload = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
      const items = (payload.results ?? []).slice(0, Math.max(1, Math.min(count, 10))).flatMap((item) => item.title && item.url
        ? [{ title: item.title, url: item.url, description: item.content ?? "" }] : []);
      if (items.length > 0) return items;
    }
  } catch (error) {
    console.warn("Primary SearXNG search unavailable, falling back:", error instanceof Error ? error.message : String(error));
  }
  return searchWebFallback(query, count);
}

export async function scrapeWebPage(rawUrl: string, maxCharacters = 12_000): Promise<ScrapedPage> {
  let target = await resolvePublicUrl(rawUrl);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetchPinnedText(target);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location || redirects === 3) throw new Error("Too many or invalid redirects");
      target = await resolvePublicUrl(new URL(location, target.url).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`Page returned ${response.status}`);
    const contentType = response.headers["content-type"] ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) throw new Error("Only HTML or plain text pages are supported");
    const declaredLength = Number(response.headers["content-length"] ?? 0);
    if (declaredLength > 1_000_000) throw new Error("Page is too large");
    const html = response.body;
    const parsed = contentType.includes("text/html") ? htmlToText(html) : { title: null, text: html };
    const limit = Math.max(1_000, Math.min(maxCharacters, 30_000));
    return { url: target.url.toString(), title: parsed.title, text: parsed.text.slice(0, limit), truncated: parsed.text.length > limit };
  }
  throw new Error("Unable to fetch page");
}
