import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AuditPage } from "./pages/AuditPage";
import { ComparePage } from "./pages/ComparePage";
import { DashboardPage } from "./pages/DashboardPage";
import { DataConnectorsPage } from "./pages/DataConnectorsPage";
import { EvidenceLibraryPage } from "./pages/EvidenceLibraryPage";
import { HouseholdPage } from "./pages/HouseholdPage";
import { PassportPage } from "./pages/PassportPage";
import { RecommendationPage } from "./pages/RecommendationPage";
import { WorkbenchPage } from "./pages/WorkbenchPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "evidence", element: <EvidenceLibraryPage /> },
      { path: "connectors", element: <DataConnectorsPage /> },
      { path: "workbench", element: <WorkbenchPage /> },
      { path: "households/:householdId", element: <HouseholdPage /> },
      { path: "households/:householdId/compare", element: <ComparePage /> },
      { path: "households/:householdId/recommendation", element: <RecommendationPage /> },
      { path: "households/:householdId/passports/:passportId", element: <PassportPage /> },
      { path: "households/:householdId/audit", element: <AuditPage /> },
      { path: "*", element: <Navigate to="/" replace /> }
    ]
  }
]);
