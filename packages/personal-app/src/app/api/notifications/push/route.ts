import { hasPushSubscription, removePushSubscription, savePushSubscription } from "@tinypersonal/backend-api";
import { authorizedOwnerKey } from "@/lib/serverAuth";
import { z } from "zod";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(4_096),
  keys: z.object({ p256dh: z.string().min(1).max(1_024), auth: z.string().min(1).max(1_024) }).strict(),
}).strict();

export async function GET(request: Request) {
  const ownerKey = authorizedOwnerKey(request);
  if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ configured: Boolean(process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY), publicKey: process.env.WEB_PUSH_PUBLIC_KEY ?? null, subscribed: await hasPushSubscription(ownerKey) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const ownerKey = authorizedOwnerKey(request);
  if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid push subscription" }, { status: 400 });
  try {
    await savePushSubscription(ownerKey, parsed.data);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Failed to save push subscription", error);
    return Response.json({ error: "เซิร์ฟเวอร์บันทึกอุปกรณ์ไม่สำเร็จ กรุณาตรวจสอบ database migration" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const ownerKey = authorizedOwnerKey(request);
  if (!ownerKey) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const endpoint = z.object({ endpoint: z.string().url().max(4_096) }).strict().safeParse(await request.json().catch(() => null));
  if (!endpoint.success) return Response.json({ error: "Invalid endpoint" }, { status: 400 });
  try {
    await removePushSubscription(ownerKey, endpoint.data.endpoint);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to remove push subscription", error);
    return Response.json({ error: "เซิร์ฟเวอร์นำอุปกรณ์ออกไม่สำเร็จ" }, { status: 500 });
  }
}
