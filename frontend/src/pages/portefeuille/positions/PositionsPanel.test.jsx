import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PositionsPanel from "./PositionsPanel.jsx";
import { getAllocation, getPositions } from "../../../services/positionsService.js";
import { ApiError } from "../../../services/apiClient.js";
import { updatePositionProtection } from "../../../services/positionsService.js";
import { closePosition } from "../../../services/orderBookService.js";

vi.mock("../../../services/positionsService.js", () => ({
  getPositions: vi.fn(),
  getAllocation: vi.fn(),
  updatePositionProtection: vi.fn(),
}));

vi.mock("../../../services/orderBookService.js", () => ({
  closePosition: vi.fn(),
}));

const positionsResponse = {
  currency: "USD",
  summary: {
    openCount: 1,
    closedCount: 1,
    marketValue: 21000,
    unrealizedPnl: 1000,
    realizedPnl: -250.5,
    winningCycles: 0,
    losingCycles: 1,
  },
  open: [
    {
      symbol: "AAPL",
      quantity: 100,
      averagePrice: 200,
      currentPrice: 210,
      priceAvailable: true,
      marketValue: 21000,
      costBasis: 20000,
      unrealizedPnl: 1000,
      unrealizedPercent: 5,
      weightPercent: 21,
      realizedPnl: 0,
      openedAt: "2026-10-01T10:00:00Z",
    },
  ],
  closed: [
    {
      symbol: "BTC/USD",
      status: "closed",
      openedAt: "2026-10-02T10:00:00Z",
      closedAt: "2026-10-03T10:00:00Z",
      quantity: 0,
      averagePrice: 0,
      averageBuyPrice: 60000,
      averageSellPrice: 59000,
      realizedPnl: -250.5,
      returnPercent: -1.67,
    },
  ],
};

const allocationResponse = (overrides = {}) => ({
  currency: "USD",
  totalValue: 100000,
  cashValue: 79000,
  investedValue: 21000,
  thresholdPercent: 30,
  slices: [
    { key: "CASH", kind: "cash", value: 79000, weightPercent: 79, concentrated: false },
    { key: "AAPL", kind: "asset", value: 21000, weightPercent: 21, concentrated: false },
  ],
  concentratedSymbols: [],
  largestAssetWeightPercent: 21,
  status: "ok",
  message: "Portefeuille bien réparti.",
  ...overrides,
});

describe("PositionsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPositions.mockResolvedValue(positionsResponse);
    getAllocation.mockResolvedValue(allocationResponse());
    updatePositionProtection.mockResolvedValue({});
    closePosition.mockResolvedValue({});
  });

  it("affiche le résumé et les positions ouvertes avec leur P&L latent", async () => {
    render(<PositionsPanel refreshKey={1} assets={[{ symbol: "AAPL", name: "Apple", unit: "action" }]} />);

    const row = (await screen.findByText("Apple")).closest("tr");
    expect(within(row).getByText("AAPL")).toBeInTheDocument();
    expect(within(row).getByText(/\+.*1\s?000,00/)).toHaveClass("is-positive", { exact: false });
    expect(screen.getByText("Portefeuille bien réparti.")).toBeInTheDocument();
    expect(getPositions).toHaveBeenCalledWith("all");
  });

  it("colore la perte réalisée en négatif sur l'onglet des positions fermées", async () => {
    render(<PositionsPanel refreshKey={1} />);
    await screen.findByText("AAPL");

    fireEvent.click(screen.getByRole("tab", { name: /Fermées/ }));

    const row = screen.getByText("BTC/USD").closest("tr");
    expect(within(row).getAllByText(/250,50/)[0].closest("td")).toHaveClass("is-negative");
    expect(within(row).getByText(/-1,67 %/)).toBeInTheDocument();
  });

  it("affiche l'alerte de concentration quand le backend la déclenche", async () => {
    getAllocation.mockResolvedValue(
      allocationResponse({
        status: "warning",
        message: "AAPL représente 45 % du portefeuille.",
        concentratedSymbols: ["AAPL"],
        slices: [
          { key: "CASH", kind: "cash", value: 55000, weightPercent: 55, concentrated: false },
          { key: "AAPL", kind: "asset", value: 45000, weightPercent: 45, concentrated: true },
        ],
      }),
    );
    render(<PositionsPanel refreshKey={1} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("AAPL représente 45 %");
    fireEvent.click(screen.getByRole("tab", { name: "Répartition" }));
    expect(screen.getByText("Concentré")).toBeInTheDocument();
  });

  it("explique quoi faire quand il n'y a aucune position", async () => {
    getPositions.mockResolvedValue({
      currency: "USD",
      summary: { openCount: 0, closedCount: 0, marketValue: 0, unrealizedPnl: 0, realizedPnl: 0, winningCycles: 0, losingCycles: 0 },
      open: [],
      closed: [],
    });
    getAllocation.mockResolvedValue(allocationResponse({ status: "empty", slices: [], totalValue: 100000 }));
    render(<PositionsPanel refreshKey={1} />);

    expect(await screen.findByText(/Aucune position ouverte/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Fermées/ }));
    expect(screen.getByText(/Aucune position fermée/)).toBeInTheDocument();
  });

  it("recharge les données quand refreshKey change", async () => {
    const { rerender } = render(<PositionsPanel refreshKey={1} />);
    await screen.findByText("AAPL");
    rerender(<PositionsPanel refreshKey={2} />);
    await waitFor(() => expect(getPositions).toHaveBeenCalledTimes(2));
  });

  it("invite à se connecter sur une erreur 401", async () => {
    getPositions.mockRejectedValue(new ApiError(401, "Unauthorized"));
    render(<PositionsPanel refreshKey={1} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Connectez-vous");
  });

  it("enregistre les protections de la position puis resynchronise le portefeuille", async () => {
    const onExecuted = vi.fn();
    render(<PositionsPanel refreshKey={1} onExecuted={onExecuted} />);
    await screen.findByText("AAPL");

    fireEvent.click(screen.getByText("Protections"));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Stop-loss AAPL" }), {
      target: { value: "190" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Take-profit AAPL" }), {
      target: { value: "240" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(updatePositionProtection).toHaveBeenCalledWith("AAPL", {
        stopLoss: 190,
        takeProfit: 240,
      }),
    );
    expect(onExecuted).toHaveBeenCalledOnce();
  });

  it("demande confirmation avant la fermeture au marché", async () => {
    const onExecuted = vi.fn();
    render(<PositionsPanel refreshKey={1} onExecuted={onExecuted} />);
    await screen.findByText("AAPL");

    fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Vendre toute la position AAPL");
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la fermeture" }));

    await waitFor(() => expect(closePosition).toHaveBeenCalledWith("AAPL"));
    expect(onExecuted).toHaveBeenCalledOnce();
  });
});
