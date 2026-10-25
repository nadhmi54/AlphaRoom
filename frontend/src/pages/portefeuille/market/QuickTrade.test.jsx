import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuickTrade from "./QuickTrade.jsx";
import { placeBookOrder } from "../../../services/orderBookService.js";

vi.mock("../../../services/orderBookService.js", () => ({ placeBookOrder: vi.fn() }));

const account = {
  portfolio: { cash: 10000, totalValue: 10000 },
  positions: [{ symbol: "BTC/USD", quantity: 0.5, averagePrice: 60000 }],
};

const setup = (props = {}) => {
  const onExecuted = vi.fn();
  const onToast = vi.fn();
  render(<QuickTrade symbol="BTC/USD" unit="BTC" price={100} account={account} onExecuted={onExecuted} onToast={onToast} {...props} />);
  return { onExecuted, onToast };
};

const type = (value) => fireEvent.change(screen.getByRole("spinbutton"), { target: { value } });

describe("QuickTrade", () => {
  beforeEach(() => vi.clearAllMocks());

  it("désactive l'envoi tant que la quantité est vide", () => {
    setup();
    expect(screen.getByRole("button", { name: "Acheter BTC/USD" })).toBeDisabled();
  });

  it("calcule le montant estimé", () => {
    setup();
    type("2");
    expect(screen.getByText(/200,00/)).toBeInTheDocument();
  });

  it("refuse un achat qui dépasse le cash", () => {
    setup();
    type("1000");
    expect(screen.getByRole("alert")).toHaveTextContent("Dépasse ton cash");
    expect(screen.getByRole("button", { name: "Acheter BTC/USD" })).toBeDisabled();
  });

  it("refuse une vente qui dépasse la position détenue", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Vendre/ }));
    type("2");
    expect(screen.getByRole("alert")).toHaveTextContent("quantité que tu détiens");
  });

  it("remplit la quantité avec les raccourcis 50 % et Max", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "50 %" }));
    expect(screen.getByRole("spinbutton")).toHaveValue(49.5);
    fireEvent.click(screen.getByRole("button", { name: "Max" }));
    expect(screen.getByRole("spinbutton")).toHaveValue(99);
  });

  it("envoie un ordre au marché et notifie l'exécution", async () => {
    placeBookOrder.mockResolvedValue({ filledQuantity: 2, averagePrice: 100, notional: 200 });
    const { onExecuted, onToast } = setup();
    type("2");
    fireEvent.click(screen.getByRole("button", { name: "Acheter BTC/USD" }));
    await waitFor(() => expect(onExecuted).toHaveBeenCalled());
    expect(placeBookOrder).toHaveBeenCalledWith(expect.objectContaining({ symbol: "BTC/USD", side: "buy", type: "market", quantity: 2 }));
    expect(onToast).toHaveBeenCalledWith(expect.objectContaining({ tone: "success" }));
    expect(screen.getByRole("spinbutton")).toHaveValue(null);
  });

  it("signale un ordre sans contrepartie", async () => {
    placeBookOrder.mockResolvedValue({ filledQuantity: 0 });
    const { onToast } = setup();
    type("1");
    fireEvent.click(screen.getByRole("button", { name: "Acheter BTC/USD" }));
    await waitFor(() => expect(onToast).toHaveBeenCalledWith(expect.objectContaining({ tone: "error" })));
  });

  it("affiche le refus du serveur", async () => {
    placeBookOrder.mockRejectedValue(new Error("Cash insuffisant"));
    const { onToast } = setup();
    type("1");
    fireEvent.click(screen.getByRole("button", { name: "Acheter BTC/USD" }));
    expect(await screen.findByText("Cash insuffisant")).toBeInTheDocument();
    expect(onToast).toHaveBeenCalledWith(expect.objectContaining({ tone: "error", title: "Ordre refusé" }));
  });

  it("le raccourci S passe en mode vente", () => {
    setup();
    fireEvent.keyDown(document, { key: "s" });
    expect(screen.getByRole("button", { name: "Vendre BTC/USD" })).toBeInTheDocument();
  });
});
