import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import "./index.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { HomePage } from "@/pages/HomePage";
import { RoomPage } from "@/pages/RoomPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { NotesPage } from "@/pages/NotesPage";
import { AuthPage } from "@/pages/AuthPage";
import { MyMeetingsPage } from "@/pages/MyMeetingsPage";
import { AuthProvider } from "@/lib/auth";

const router = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  { path: "/m/:roomCode", element: <RoomPage /> },
  { path: "/m/:roomCode/notes", element: <NotesPage /> },
  { path: "/signin", element: <AuthPage mode="signin" /> },
  { path: "/signup", element: <AuthPage mode="signup" /> },
  { path: "/meetings", element: <MyMeetingsPage /> },
  { path: "*", element: <NotFoundPage /> },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
      {/* Bottom-left like Google Meet; offset keeps it above the call's control bar. */}
      <Toaster richColors position="bottom-left" offset={{ bottom: 96, left: 16 }} mobileOffset={{ bottom: 84, left: 8, right: 8 }} />
    </ErrorBoundary>
  </StrictMode>,
);
