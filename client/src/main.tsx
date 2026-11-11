import {
  StrictMode,
  Suspense,
  lazy,
  type ComponentType,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, matchPath, Outlet, RouterProvider, useLocation } from "react-router";
import "./index.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/sonner";
import { HomePage } from "@/pages/HomePage";
import { AuthProvider } from "@/lib/auth";
import { PageLoading } from "@/components/PageLoading";
import { IdleLogout } from "@/components/IdleLogout";
import { registerServiceWorker } from "@/lib/install";

const RELOAD_FLAG = "meetapp-reloaded-for-update";

/**
 * Loads a page's code only when it's first opened (the landing page stays small).
 * After a new deploy the old page files are gone; an open tab then reloads once to get the new version.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each page has its own props
function page<M>(load: () => Promise<M>, pick: (m: M) => ComponentType<any>) {
  return lazy(() =>
    load().then(
      (m) => {
        try {
          sessionStorage.removeItem(RELOAD_FLAG);
        } catch {
          /* private mode */
        }
        return { default: pick(m) };
      },
      (err) => {
        let reloaded = true;
        try {
          reloaded = !!sessionStorage.getItem(RELOAD_FLAG);
          if (!reloaded) sessionStorage.setItem(RELOAD_FLAG, "1");
        } catch {
          /* private mode: don't risk a reload loop */
        }
        if (reloaded) throw err; // already tried: show the error screen
        location.reload();
        return new Promise<never>(() => {});
      },
    ),
  );
}

const RoomPage = page(
  () => import("@/pages/RoomPage"),
  (m) => m.RoomPage,
);
const NotesPage = page(
  () => import("@/pages/NotesPage"),
  (m) => m.NotesPage,
);
const AuthPage = page(
  () => import("@/pages/AuthPage"),
  (m) => m.AuthPage,
);
const AppShell = page(
  () => import("@/components/AppShell"),
  (m) => m.AppShell,
);
const DashboardPage = page(
  () => import("@/pages/DashboardPage"),
  (m) => m.DashboardPage,
);
const MyMeetingsPage = page(
  () => import("@/pages/MyMeetingsPage"),
  (m) => m.MyMeetingsPage,
);
const ProfilePage = page(
  () => import("@/pages/ProfilePage"),
  (m) => m.ProfilePage,
);
const ForgotPasswordPage = page(
  () => import("@/pages/PasswordPages"),
  (m) => m.ForgotPasswordPage,
);
const ResetPasswordPage = page(
  () => import("@/pages/PasswordPages"),
  (m) => m.ResetPasswordPage,
);
const VerifyEmailPage = page(
  () => import("@/pages/PasswordPages"),
  (m) => m.VerifyEmailPage,
);
const CheckEmailPage = page(
  () => import("@/pages/PasswordPages"),
  (m) => m.CheckEmailPage,
);
const SeriesPage = page(
  () => import("@/pages/InvitePages"),
  (m) => m.SeriesPage,
);
const ReplyPage = page(
  () => import("@/pages/InvitePages"),
  (m) => m.ReplyPage,
);
const CalendarPage = page(
  () => import("@/pages/CalendarPage"),
  (m) => m.CalendarPage,
);
const SearchPage = page(
  () => import("@/pages/SearchPage"),
  (m) => m.SearchPage,
);
const TeamsPage = page(
  () => import("@/pages/TeamsPage"),
  (m) => m.TeamsPage,
);
const TeamPage = page(
  () => import("@/pages/TeamsPage"),
  (m) => m.TeamPage,
);
const BillingPage = page(
  () => import("@/pages/BillingPage"),
  (m) => m.BillingPage,
);
const NotFoundPage = page(
  () => import("@/pages/NotFoundPage"),
  (m) => m.NotFoundPage,
);

const load = (el: ReactNode, dark = false) => (
  <Suspense fallback={<PageLoading dark={dark} />}>{el}</Suspense>
);

/** Wraps every page: idle sign-out (skips meetings itself) and pop-up messages. */
function Root() {
  // the meeting screens are always dark, so their pop-ups are too (whatever the site theme is)
  const inMeeting = !!matchPath("/m/:roomCode", useLocation().pathname);
  return (
    <>
      <IdleLogout />
      <Outlet />
      {/* Bottom-left like Google Meet; offset keeps it above the call's control bar.
          In meetings the wrapper switches the colours to the dark set (it adds no box of its own). */}
      <div className={inMeeting ? "dark contents" : "contents"}>
        <Toaster
          richColors
          position="bottom-left"
          offset={{ bottom: 96, left: 16 }}
          mobileOffset={{ bottom: 84, left: 8, right: 8 }}
          {...(inMeeting && { theme: "dark" as const })}
        />
      </div>
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/m/:roomCode", element: load(<RoomPage />, true) },
      { path: "/m/:roomCode/notes", element: load(<NotesPage />) },
      // key: Sign in and Sign up are the same component; a different key makes each page start empty
      {
        path: "/signin",
        element: load(<AuthPage key="signin" mode="signin" />),
      },
      {
        path: "/signup",
        element: load(<AuthPage key="signup" mode="signup" />),
      },
      // signed-in area: sidebar layout (each page inside loads on its own, the sidebar stays)
      {
        element: load(<AppShell />),
        children: [
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/meetings", element: <MyMeetingsPage /> },
          { path: "/profile", element: <ProfilePage /> },
          { path: "/calendar", element: <CalendarPage /> },
          { path: "/search", element: <SearchPage /> },
          { path: "/teams", element: <TeamsPage /> },
          { path: "/teams/:teamId", element: <TeamPage /> },
          { path: "/billing", element: <BillingPage /> },
        ],
      },
      { path: "/forgot-password", element: load(<ForgotPasswordPage />) },
      { path: "/reset-password", element: load(<ResetPasswordPage />) },
      { path: "/verify-email", element: load(<VerifyEmailPage />) },
      { path: "/check-email", element: load(<CheckEmailPage />) },
      { path: "/s/:seriesId", element: load(<SeriesPage />) },
      { path: "/rsvp", element: load(<ReplyPage />) },
      { path: "*", element: load(<NotFoundPage />) },
    ],
  },
]);

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
