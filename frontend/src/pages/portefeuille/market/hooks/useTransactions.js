import { useState, useEffect, useCallback } from "react";
import { marketApi } from "../api/marketApi.js";

export default function useTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    symbol: "",
    side: "",
    from: "",
    to: "",
    minAmount: "",
    maxAmount: "",
    page: 1,
    limit: 10
  });
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 0,
    page: 1
  });

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await marketApi.getTransactions(filters);
      setTransactions(data.transactions);
      setPagination({
        total: data.total,
        totalPages: data.totalPages,
        page: data.page
      });
      setError(null);
    } catch (err) {
      setError(err.message || "Erreur lors du chargement des transactions");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const setFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const setPage = (page) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const exportCsv = async () => {
    try {
      await marketApi.downloadTransactionsCsv(filters);
      setError(null);
    } catch (err) {
      setError(err.message || "Erreur lors de l'export CSV");
    }
  };

  return { transactions, loading, error, filters, setFilter, pagination, setPage, exportCsv };
}
