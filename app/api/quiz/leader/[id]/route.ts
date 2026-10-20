import { getLeaderPortrait } from "@/lib/quiz/bank";

/** Leader pixel portrait for the quiz grade screen (served from KV, or content/ in dev). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9-]+$/.test(id)) return new Response("Not found", { status: 404 });
  const png = await getLeaderPortrait(id);
  if (!png) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
