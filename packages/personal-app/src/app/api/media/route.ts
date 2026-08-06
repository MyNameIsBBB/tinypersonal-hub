import { createMediaAccessToken, listMediaAssets, registerMediaAsset } from "@tinypersonal/backend-api";
import { isAuthorizedRequest } from "@/lib/serverAuth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const assets = await listMediaAssets();
  const expiresAt = Math.floor(Date.now() / 1000) + 300;
  return Response.json({ assets: assets.map((asset) => ({
    ...asset,
    downloadUrl: `/api/media/${asset.id}?token=${encodeURIComponent(createMediaAccessToken(asset.id, expiresAt))}`,
  })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "file is required" }, { status: 400 });

  try {
    const asset = await registerMediaAsset({
      fileName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      noteId: String(form.get("noteId") || "") || undefined,
      scheduleItemId: String(form.get("scheduleItemId") || "") || undefined,
    });
    const expiresAt = Math.floor(Date.now() / 1000) + 300;
    const token = createMediaAccessToken(asset.id, expiresAt);
    return Response.json({
      id: asset.id,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
      downloadUrl: `/api/media/${asset.id}?token=${encodeURIComponent(token)}`,
      expiresAt,
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 });
  }
}
