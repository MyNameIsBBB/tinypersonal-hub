import { deleteMediaAsset, readMediaAsset, updateMediaAssetLinks, verifyMediaAccessToken } from "@tinypersonal/backend-api";
import { isAuthorizedRequest } from "@/lib/serverAuth";
import { mediaLinksSchema } from "@tinypersonal/assistant-core";
import { parseJson } from "@/lib/apiValidation";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!verifyMediaAccessToken(id, token)) return Response.json({ error: "Invalid or expired link" }, { status: 403 });

  try {
    const { asset, bytes } = await readMediaAsset(id);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.fileSize),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`,
        "Cache-Control": "private, max-age=300, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Asset not found" }, { status: 404 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const parsed = await parseJson(request, mediaLinksSchema); if ("response" in parsed) return parsed.response;
  const body = parsed.data;
  return Response.json({ asset: await updateMediaAssetLinks(id, body) });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAuthorizedRequest(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  await deleteMediaAsset(id);
  return new Response(null, { status: 204 });
}
