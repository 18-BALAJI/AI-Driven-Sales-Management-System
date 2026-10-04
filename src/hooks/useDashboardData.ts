import { useState, useEffect, useCallback } from "react";
import { fetchTransactions, fetchProducts } from "@/lib/api";
import { performLinearRegression, predictFuture } from "@/lib/ml";

export type DashboardMetrics = {
  totalRevenue: number;
  netProfit: number;
  expenses: number;
  orders: number;
  revenueChange: number;
  profitChange: number;
  expensesChange: number;
  ordersChange: number;
};

export type TrendData = {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
};

export type DailySalesData = {
  day: string;
  sales: number;
  isForecast?: boolean;
};

export type CategoryData = {
  name: string;
  value: number;
  percentage: number;
};

export function useDashboardData(daysHistory = 7) {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalRevenue: 0,
    netProfit: 0,
    expenses: 0,
    orders: 0,
    revenueChange: 0,
    profitChange: 0,
    expensesChange: 0,
    ordersChange: 0,
  });
  const [revenueTrend, setRevenueTrend] = useState<TrendData[]>([]);
  const [dailySales, setDailySales] = useState<DailySalesData[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all transactions and products from API
      const [transactions, products] = await Promise.all([
        fetchTransactions(),
        fetchProducts(),
      ]);

      if (!transactions || !products) return;

      // Calculate Metrics
      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();
      const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
      const lastMonth = lastMonthDate.getMonth();
      const lastMonthYear = lastMonthDate.getFullYear();

      const filterByMonth = (t: any, m: number, y: number) => {
        const d = new Date(t.date);
        return d.getMonth() === m && d.getFullYear() === y;
      };

      const thisMonthTrans = transactions.filter(t => filterByMonth(t, thisMonth, thisYear));
      const lastMonthTrans = transactions.filter(t => filterByMonth(t, lastMonth, lastMonthYear));

      const calcTotal = (ts: any[], type: string) => ts.filter(t => t.type === type).reduce((s, t) => s + Number(t.amount), 0);

      const thisRev = calcTotal(thisMonthTrans, "income");
      const lastRev = calcTotal(lastMonthTrans, "income");
      const thisExp = calcTotal(thisMonthTrans, "expense");
      const lastExp = calcTotal(lastMonthTrans, "expense");
      const thisOrders = thisMonthTrans.filter(t => t.type === "income").length;
      const lastOrders = lastMonthTrans.filter(t => t.type === "income").length;

      const calcPct = (curr: number, prev: number) => prev === 0 ? 0 : Math.round(((curr - prev) / prev) * 100);

      const totalRevenue = transactions.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
      const expenses = transactions.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
      const netProfit = totalRevenue - expenses;
      const orders = transactions.filter(t => t.type === "income").length;

      setMetrics({
        totalRevenue,
        netProfit,
        expenses,
        orders,
        revenueChange: lastRev > 0 ? calcPct(thisRev, lastRev) : (thisRev > 0 ? 100 : 0),
        profitChange: (lastRev - lastExp) !== 0 ? calcPct(thisRev - thisExp, lastRev - lastExp) : ((thisRev - thisExp) > 0 ? 100 : 0),
        expensesChange: lastExp > 0 ? calcPct(thisExp, lastExp) : (thisExp > 0 ? 100 : 0),
        ordersChange: lastOrders > 0 ? calcPct(thisOrders, lastOrders) : (thisOrders > 0 ? 100 : 0)
      });

      // Calculate monthly trend
      const monthlyNodes: Record<string, TrendData> = {};
      transactions.forEach(t => {
        const date = new Date(t.date);
        const monthYear = date.toLocaleString('default', { month: 'short' });
        if (!monthlyNodes[monthYear]) {
          monthlyNodes[monthYear] = { month: monthYear, revenue: 0, expenses: 0, profit: 0 };
        }
        if (t.type === "income") monthlyNodes[monthYear].revenue += Number(t.amount);
        else monthlyNodes[monthYear].expenses += Number(t.amount);
        monthlyNodes[monthYear].profit = monthlyNodes[monthYear].revenue - monthlyNodes[monthYear].expenses;
      });
      setRevenueTrend(Object.values(monthlyNodes).slice(-6));

      // Calculate daily sales and forecast
      const trainingDays = 120;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - trainingDays);

      const timelineMap: Record<string, number> = {};
      for (let i = 0; i <= trainingDays; i++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        timelineMap[d.toISOString().split('T')[0]] = 0;
      }

      // Populate with actual data
      transactions.forEach(t => {
        if (t.type === "income" && timelineMap[t.date] !== undefined) {
          timelineMap[t.date] += Number(t.amount);
        }
      });

      const trainingValues = Object.keys(timelineMap).sort().map(k => timelineMap[k]);
      const { slope, intercept } = performLinearRegression(trainingValues);
      const forecastValues = predictFuture(slope, intercept, trainingValues.length, 7);

      const chartData: DailySalesData[] = [];
      const daysShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

      // Historical range to display based on parameter
      for (let i = daysHistory - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const label = daysHistory > 7
          ? d.toLocaleDateString('default', { month: 'short', day: 'numeric' })
          : daysShort[d.getDay()];

        chartData.push({
          day: label,
          sales: timelineMap[dateStr] || 0,
          isForecast: false
        });
      }

      // Forecast (fixed 7 days)
      for (let i = 1; i <= 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        const dayLabel = daysHistory > 7
          ? d.toLocaleDateString('default', { month: 'short', day: 'numeric' })
          : daysShort[d.getDay()];

        chartData.push({
          day: dayLabel,
          sales: forecastValues[i - 1] || 0,
          isForecast: true
        });
      }

      setDailySales(chartData);

      // Category breakdown
      const categoryTotals: Record<string, number> = {};
      let totalProdRevenue = 0;
      products.forEach(p => {
        if (!categoryTotals[p.category]) categoryTotals[p.category] = 0;
        categoryTotals[p.category] += Number(p.revenue);
        totalProdRevenue += Number(p.revenue);
      });

      const breakdown = Object.entries(categoryTotals).map(([name, value]) => ({
        name,
        value,
        percentage: totalProdRevenue > 0 ? Math.round((value / totalProdRevenue) * 100) : 0
      })).sort((a, b) => b.value - a.value);
      setCategoryBreakdown(breakdown);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [daysHistory]);

  useEffect(() => {
    fetchData();
    // Poll every 30 seconds instead of Supabase realtime
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { metrics, revenueTrend, dailySales, categoryBreakdown, loading };
}
