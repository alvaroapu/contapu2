import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, RequireAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import Index from "./pages/Index";
import Catalogo from "./pages/Catalogo";
import Placeholder from "./pages/Placeholder";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<Index />} />
                      <Route path="/catalogo" element={<Catalogo />} />
                      <Route path="/ventas" element={<Placeholder title="Ventas" />} />
                      <Route path="/importar" element={<Placeholder title="Importar Reportes" />} />
                      <Route path="/liquidaciones" element={<Placeholder title="Liquidaciones" />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
