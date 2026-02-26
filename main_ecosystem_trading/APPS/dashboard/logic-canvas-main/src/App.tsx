import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import Index from "./pages/Index";
import HelpGuide from "./pages/HelpGuide";
import NotFound from "./pages/NotFound";
import { ConsoleOverlay } from "@/components/ConsoleOverlay";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <SettingsProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <ConsoleOverlay />
          <BrowserRouter future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/help" element={<HelpGuide />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </SettingsProvider>
    </ErrorBoundary>
  </QueryClientProvider>
);

export default App;
