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
import { ProfilePage } from "@/pages/ProfilePage";
import { DashboardPage } from "@/pages/DashboardPage";
import { AppShell } from "@/components/AppShell";
import { ForgotPasswordPage, ResetPasswordPage } from "@/pages/PasswordPages";
import { AuthProvider } from "@/lib/auth";

const router = createBrowserRouter([
  { path: "/", element: <HomePage /> },
  { path: "/m/:roomCode", element: <RoomPage /> },
  { path: "/m/:roomCode/notes", element: <NotesPage /> },
  // key: Sign in and Sign up are the same component; a different key makes each page start empty
  { path: "/signin", element: <AuthPage key="signin" mode="signin" /> },
  { path: "/signup", element: <AuthPage key="signup" mode="signup" /> },
  // signed-in area: sidebar layout
  {
    element: <AppShell />,
    children: [
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/meetings", element: <MyMeetingsPage /> },
      { path: "/profile", element: <ProfilePage /> },
    ],
  },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
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
