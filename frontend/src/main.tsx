import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/App";
import { ToastProvider } from "@/components/ui/toast";
import { Toaster } from "@/components/ui/toaster";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider swipeDirection="right">
      <App />
      <Toaster />
    </ToastProvider>
  </StrictMode>,
);
