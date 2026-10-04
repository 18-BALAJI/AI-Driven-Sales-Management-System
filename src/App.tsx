import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Dashboard from "@/pages/Dashboard";
import Transactions from "@/pages/Transactions";
import Forecasting from "@/pages/Forecasting";
import Products from "@/pages/Products";
import Anomalies from "@/pages/Anomalies";
import Pricing from "@/pages/Pricing";
import Insights from "@/pages/Insights";
import Chat from "@/pages/Chat";
import Simulate from "@/pages/Simulate";
import Tutorials from "@/pages/Tutorials";
import AnalystTutorials from "@/pages/AnalystTutorials";
import AnalystVisibility from "@/pages/AnalystVisibility";
import Login from "@/pages/Login";
import Profile from "@/pages/Profile";
import { RouteGuard } from "@/components/RouteGuard";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

/** Full-screen spinner shown while the cached session is being revalidated. */
function AuthLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

/** Gates the whole dashboard: unauthenticated users are sent to /login. */
function ProtectedApp() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  return (
    <DashboardLayout>
      <RouteGuard>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/forecasting" element={<Forecasting />} />
          <Route path="/products" element={<Products />} />
          <Route path="/anomalies" element={<Anomalies />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/simulate" element={<Simulate />} />
          <Route path="/tutorials" element={<Tutorials />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/analyst-tutorials" element={<AnalystTutorials />} />
          <Route path="/analyst-visibility" element={<AnalystVisibility />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </RouteGuard>
    </DashboardLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={<ProtectedApp />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
