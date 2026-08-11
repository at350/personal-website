import { getMediaLibrary } from "@/lib/media/feeds";
import { MEDIA_SEED, RECENT_X_FALLBACKS } from "@/lib/media/seed";
import { MediaApiResponseSchema } from "@/lib/media/types";

const CACHE_CONTROL =
  "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400";

export async function GET() {
  try {
    const payload = await getMediaLibrary();
    return Response.json(payload, {
      headers: { "cache-control": CACHE_CONTROL },
    });
  } catch (error) {
    // A malformed upstream response should never make the curated library vanish.
    console.error(
      "[media-api] Falling back to bundled media:",
      error instanceof Error ? error.message : "unknown error"
    );

    const payload = MediaApiResponseSchema.parse({
      items: MEDIA_SEED,
      generatedAt: new Date().toISOString(),
      degraded: true,
      feeds: {
        x: { state: "fallback", itemCount: RECENT_X_FALLBACKS.length },
        letterboxd: { state: "unavailable", itemCount: 0 },
        substack: { state: "unavailable", itemCount: 0 },
      },
      warnings: ["Live media is temporarily unavailable; showing saved items."],
    });

    return Response.json(payload, {
      headers: { "cache-control": "public, max-age=30, s-maxage=300" },
    });
  }
}

