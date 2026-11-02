// Les paires de change ont besoin de plus de décimales que l'or ou le Bitcoin.
export const decimalsFor = (price) => (price < 10 ? 5 : 2);

export const formatPrice = (price) =>
  price === null || price === undefined
    ? "—"
    : new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: decimalsFor(price),
        maximumFractionDigits: decimalsFor(price),
      }).format(price);

export const formatPercent = (value) => {
  const rounded = Math.round((value ?? 0) * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded)} %`;
};

export const formatClock = (t, withSeconds = true) =>
  new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  }).format(new Date(t));

export const trend = (value) => (value > 0 ? "is-up" : value < 0 ? "is-down" : "");
