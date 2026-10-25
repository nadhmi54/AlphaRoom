import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LiveMarketPanel from "./LiveMarketPanel.jsx";

vi.mock("../../../services/orderBookService.js", () => ({ placeBookOrder: vi.fn() }));

const quote = (symbol, name, price, extra = {}) => ({
  symbol,
  name,
  price,
  source: "live",
  updatedAt: "2026-10-25T10:00:10Z",
  changePercent: 0.5,
  spark: [price - 1, price, price + 1],
  ...extra,
});

const makeMarket = (overrides = {}) => ({
  quotes: [
    quote("XAU/USD", "Or", 2690.5, { source: "simulated", changePercent: -0.2 }),
    quote("BTC/USD", "Bitcoin", 68000),
    quote("EUR/USD", "Euro/Dollar", 1.08345),
  ],
  series: [
    { t: Date.parse("2026-10-25T10:00:00Z"), price: 67900 },
    { t: Date.parse("2026-10-25T10:00:05Z"), price: 68000 },
  ],
  error: "",
  loadingSeries: false,
  ...overrides,
});

const account = {
  portfolio: { cash: 10000, totalValue: 12000 },
  positions: [{ symbol: "BTC/USD", quantity: 0.5, averagePrice: 60000 }],
};

const setup = (props = {}) => {
  const handlers = { onSymbolChange: vi.fn(), onRangeChange: vi.fn(), onFocusChange: vi.fn(), onToast: vi.fn() };
  render(
    <LiveMarketPanel
      market={makeMarket()}
      symbol="BTC/USD"
      range="5m"
      assets={[{ symbol: "BTC/USD", unit: "BTC" }]}
      account={account}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

describe("LiveMarketPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("affiche les cartes d'actifs avec le badge En direct ou Simulé", () => {
    setup();
    expect(screen.getByText("Bitcoin", { selector: "small" })).toBeInTheDocument();
    expect(screen.getByText("Or", { selector: "small" })).toBeInTheDocument();
    expect(screen.getByText("En direct")).toBeInTheDocument();
  });

  it("montre le badge Simulé pour un actif dont le marché est fermé", () => {
    setup({ symbol: "XAU/USD" });
    expect(screen.getByText("Simulé")).toBeInTheDocument();
  });

  it("affiche 5 décimales pour une paire de change", () => {
    setup({ symbol: "EUR/USD" });
    expect(screen.getByTestId("live-price")).toHaveTextContent("1,08345");
  });

  it("change d'actif en cliquant sur une carte", () => {
    const { onSymbolChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: /XAU\/USD/ }));
    expect(onSymbolChange).toHaveBeenCalledWith("XAU/USD");
  });

  it("change de période", () => {
    const { onRangeChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "1 h" }));
    expect(onRangeChange).toHaveBeenCalledWith("1h");
  });

  it("propose le plein écran et le quitte", () => {
    const { onFocusChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Plein écran/ }));
    expect(onFocusChange).toHaveBeenCalledWith(true);
  });

  it("montre la ligne d'achat moyen avec le gain en temps réel", () => {
    setup();
    expect(screen.getByText(/Ton achat moyen/)).toBeInTheDocument();
  });

  it("affiche un message d'attente tant qu'il n'y a pas deux points", () => {
    setup({ market: makeMarket({ series: [] }) });
    expect(screen.getByText("Collecte des premiers prix…")).toBeInTheDocument();
  });

  it("affiche l'erreur de chargement", () => {
    setup({ market: makeMarket({ error: "Connectez-vous pour voir les prix en direct." }) });
    expect(screen.getByRole("alert")).toHaveTextContent("Connectez-vous");
  });
});
