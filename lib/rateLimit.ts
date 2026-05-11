// lib/rateLimit.ts
type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
};

const buckets = new Map<string, Bucket>();

function rateLimitLocal(key: string, options: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const { limit, windowMs } = options;

  let bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    limit,
  };
}

export async function rateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  if (process.env.NODE_ENV === "test") {
    return rateLimitLocal(key, options);
  }

  try {
    const { supabaseAdmin } = await import("@/lib/supaBaseAdmin");
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      p_bucket_key: key,
      p_limit: options.limit,
      p_window_ms: options.windowMs,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    const resetAt = row?.reset_at ? new Date(String(row.reset_at)).getTime() : Date.now() + options.windowMs;

    if (!row || Number.isNaN(resetAt)) {
      throw new Error("Invalid rate limit response.");
    }

    return {
      allowed: Boolean(row.allowed),
      remaining: Math.max(0, Number(row.remaining ?? 0)),
      resetAt,
      limit: Math.max(1, Number(row.limit_value ?? options.limit)),
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[rateLimit] falling back to local bucket store:", error);
      return rateLimitLocal(key, options);
    }
    throw error;
  }
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xrip = req.headers.get("x-real-ip");
  if (xrip) return xrip.trim();
  return "unknown";
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const resetSeconds = Math.ceil(result.resetAt / 1000);
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(resetSeconds),
  };
}
