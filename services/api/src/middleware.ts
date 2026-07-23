import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { Bindings, Variables } from "./types";

type AppMiddleware = MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }>;

export const requestContext: AppMiddleware = async (context, next) => {
  const requestId = context.req.header("cf-ray") ?? crypto.randomUUID();
  context.set("requestId", requestId);
  context.header("X-Request-Id", requestId);
  const startedAt = Date.now();
  await next();
  console.log(
    JSON.stringify({
      requestId,
      method: context.req.method,
      path: context.req.path,
      status: context.res.status,
      durationMs: Date.now() - startedAt
    })
  );
};

export const securityHeaders: AppMiddleware = async (context, next) => {
  await next();
  context.header("X-Content-Type-Options", "nosniff");
  context.header("X-Frame-Options", "DENY");
  context.header("Referrer-Policy", "strict-origin-when-cross-origin");
  context.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  context.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  context.header("Cache-Control", "no-store");
};

export const authenticate: AppMiddleware = async (context, next) => {
  if (context.env.APP_ENV !== "production") {
    context.set("advisor", {
      id: "advisor-cece-demo",
      email: "cece@example.test",
      name: "Cece Sterling"
    });
    await next();
    return;
  }

  const teamDomain = context.env.CF_ACCESS_TEAM_DOMAIN;
  const audience = context.env.CF_ACCESS_AUD;
  const token = context.req.header("cf-access-jwt-assertion");
  if (!teamDomain || !audience || !token) {
    return context.json({ error: "Unauthorized", requestId: context.get("requestId") }, 401);
  }
  try {
    const issuer = `https://${teamDomain}`;
    const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, jwks, { issuer, audience });
    const email = typeof payload.email === "string" ? payload.email : payload.sub;
    if (!email) throw new Error("Access token contains no subject");
    context.set("advisor", { id: payload.sub ?? email, email, name: email });
    await next();
  } catch {
    return context.json({ error: "Unauthorized", requestId: context.get("requestId") }, 401);
  }
};

export const rateLimit: AppMiddleware = async (context, next) => {
  if (context.req.method === "GET" || context.req.method === "HEAD") {
    await next();
    return;
  }
  const identity =
    context.req.header("cf-connecting-ip") ?? context.req.header("x-forwarded-for") ?? "local";
  const window = Math.floor(Date.now() / 60_000);
  const key = `rate:${identity}:${window}`;
  const current = Number((await context.env.CACHE.get(key)) ?? "0");
  if (current >= 30) {
    context.header("Retry-After", "60");
    return context.json({ error: "Rate limit exceeded", requestId: context.get("requestId") }, 429);
  }
  await context.env.CACHE.put(key, String(current + 1), { expirationTtl: 120 });
  await next();
};
