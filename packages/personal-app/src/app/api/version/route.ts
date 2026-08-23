export function GET() {
  return Response.json(
    { version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
