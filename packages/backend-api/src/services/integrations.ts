export type IntegrationName = "google-calendar" | "gmail" | "finance";

export type MarketQuote = { symbol: string; price: number; changePercent: number | null; asOf: string };
export async function getMarketQuotes(symbols = ["AAPL", "GOOGL"]): Promise<MarketQuote[]> {
  const key = process.env.FINANCE_API_KEY; if (!key) return [];
  return Promise.all(symbols.slice(0, 5).map(async (rawSymbol) => {
    const symbol = rawSymbol.trim().toUpperCase();
    const response = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error(`Finance API failed (${response.status})`);
    const quote = (await response.json() as { "Global Quote"?: Record<string, string> })["Global Quote"] ?? {};
    const price = Number(quote["05. price"]); if (!Number.isFinite(price)) throw new Error(`No quote for ${symbol}`);
    const percent = Number((quote["10. change percent"] ?? "").replace("%", ""));
    return { symbol, price, changePercent: Number.isFinite(percent) ? percent : null, asOf: quote["07. latest trading day"] ?? new Date().toISOString() };
  }));
}

export async function integrationHealth(name: IntegrationName) {
  const configured = name === "finance" ? Boolean(process.env.FINANCE_API_KEY) : false;
  return { name, configured, checkedAt: new Date().toISOString() };
}
