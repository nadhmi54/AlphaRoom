import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CockpitTabs from "./CockpitTabs.jsx";
import PortfolioHero from "./PortfolioHero.jsx";
import TickerTape from "./TickerTape.jsx";
import useShortcuts from "./useShortcuts.js";
import useToasts from "./useToasts.js";
import usePulse from "./usePulse.js";

describe("CockpitTabs", () => {
  it("marque l'onglet actif et notifie le changement", () => {
    const onChange = vi.fn();
    render(<CockpitTabs tabs={[{ id: "a", label: "Alpha" }, { id: "b", label: "Beta", badge: 3 }]} active="a" onChange={onChange} />);
    expect(screen.getByRole("tab", { name: /Alpha/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: /Beta/ }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("TickerTape", () => {
  it("affiche les prix et sélectionne l'actif cliqué", () => {
    const onSelect = vi.fn();
    const quotes = [{ symbol: "BTC/USD", price: 68000, source: "live", changePercent: 1 }];
    render(<TickerTape quotes={quotes} onSelect={onSelect} />);
    fireEvent.click(screen.getAllByText("BTC/USD")[0]);
    expect(onSelect).toHaveBeenCalledWith("BTC/USD");
  });
});

describe("PortfolioHero", () => {
  const account = {
    portfolio: { cash: 5000, totalValue: 10500, initialCash: 10000, returnAmount: 500, returnPercent: 5 },
    stats: { realizedPnl: 120, totalOrders: 4, buyOrders: 3, sellOrders: 1 },
  };
  it("montre le rendement, le cash et les statistiques", () => {
    render(<PortfolioHero account={account} loading={false} lastSync={null} pulse={[]} onReset={() => {}} />);
    expect(screen.getByText(/Cash/)).toBeInTheDocument();
    expect(screen.getByText(/\+5,00 %/)).toBeInTheDocument();
    expect(screen.getByText("3 achats · 1 ventes")).toBeInTheDocument();
  });
  it("propose la réinitialisation dans le menu", () => {
    const onReset = vi.fn();
    render(<PortfolioHero account={account} loading={false} lastSync={null} pulse={[]} onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: "Actions du portefeuille" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Réinitialiser/ }));
    expect(onReset).toHaveBeenCalled();
  });
});

describe("useShortcuts", () => {
  it("déclenche une touche, sauf quand on tape dans un champ", () => {
    const handler = vi.fn();
    const handlers = { f: handler };
    renderHook(() => useShortcuts(handlers));
    fireEvent.keyDown(document, { key: "F" });
    expect(handler).toHaveBeenCalledTimes(1);

    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: "f" });
    fireEvent.keyDown(document, { key: "f", ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
    input.remove();
  });
});

describe("useToasts", () => {
  it("ajoute puis retire les notifications, quatre au maximum", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToasts());
    act(() => {
      for (let i = 0; i < 6; i += 1) result.current.push({ title: `t${i}` });
    });
    expect(result.current.toasts).toHaveLength(4);
    act(() => vi.advanceTimersByTime(6100));
    expect(result.current.toasts).toHaveLength(0);
    vi.useRealTimers();
  });
});

describe("usePulse", () => {
  it("garde l'historique des valeurs reçues", () => {
    const { result, rerender } = renderHook(({ value, key }) => usePulse(value, key), { initialProps: { value: 100, key: 1 } });
    rerender({ value: 101, key: 2 });
    expect(result.current.length).toBeGreaterThanOrEqual(1);
  });
});
