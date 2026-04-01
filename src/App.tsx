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
import Ventas from "./pages/Ventas";
import Importar from "./pages/Importar";
import Liquidaciones from "./pages/Liquidaciones";
import LiquidacionDetalle from "./pages/LiquidacionDetalle";
import ImportarLibros from "./pages/ImportarLibros";
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
                      <Route path="/ventas" element={<Ventas />} />
                      <Route path="/importar" element={<Importar />} />
                      <Route path="/liquidaciones" element={<Liquidaciones />} />
                      <Route path="/liquidaciones/:id" element={<LiquidacionDetalle />} />
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
