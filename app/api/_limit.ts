// Best-effort per-IP rate limit. Serverless instances do not share memory, so this stops casual
// scripted abuse of the sponsor (which pays fees and account rent), not a determined attacker.
const hits = new Map<string, number[]>();

export function limited(request: Request, route: string, max: number, windowSec = 3600): Response | null {
  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const key = `${route}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowSec * 1000);
  if (recent.length >= max) {
    return new Response(JSON.stringify({ error: "Too many requests. Try again later." }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(windowSec) },
    });
  }
  recent.push(now);
  hits.set(key, recent);
  return null;
}
