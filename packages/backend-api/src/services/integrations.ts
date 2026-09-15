export type IntegrationName = "finance";

export type MarketQuote = { symbol: string; price: number; changePercent: number | null; asOf: string };
export async function getMarketQuotes(): Promise<MarketQuote[]> {
  return [];
}

export async function integrationHealth(name: IntegrationName) {
  return { name, configured: false, checkedAt: new Date().toISOString() };
}
