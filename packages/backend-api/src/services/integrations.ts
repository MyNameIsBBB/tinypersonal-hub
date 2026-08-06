export type IntegrationName = "google-calendar" | "gmail" | "finance";

export async function integrationHealth(name: IntegrationName) {
  return { name, configured: false, checkedAt: new Date().toISOString() };
}
