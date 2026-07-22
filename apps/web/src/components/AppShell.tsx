import {
  Activity,
  Bell,
  ChevronRight,
  Files,
  LayoutDashboard,
  Menu,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

const demoHouseholdId = "household-patel-demo";

const navigation = [
  { to: "/", label: "Advisor overview", icon: LayoutDashboard, end: true },
  { to: `/households/${demoHouseholdId}`, label: "Household twin", icon: Users, end: true },
  { to: `/households/${demoHouseholdId}/compare`, label: "Decision lab", icon: Scale },
  { to: `/households/${demoHouseholdId}/audit`, label: "Evidence & audit", icon: ShieldCheck }
];

export function AppShell() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);
  const navigationTitle = navigation
    .filter((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
    )
    .sort((left, right) => right.to.length - left.to.length)[0]?.label;
  const title = location.pathname.includes("/recommendation")
    ? "Recommendation studio"
    : navigationTitle;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>FiduciaryOS</strong>
            <span>Decision intelligence</span>
          </div>
          <button
            className="icon-button mobile-only"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>
        </div>
        <nav aria-label="Primary navigation">
          <p className="nav-label">Workspace</p>
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              {...(end === undefined ? {} : { end })}
              onClick={() => setOpen(false)}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              <Icon size={18} />
              <span>{label}</span>
              <ChevronRight className="nav-arrow" size={15} />
            </NavLink>
          ))}
          <p className="nav-label nav-label-spaced">System</p>
          <span className="nav-item muted">
            <Files size={18} />
            Evidence library
          </span>
          <span className="nav-item muted">
            <Activity size={18} />
            Data connectors
          </span>
        </nav>
        <div className="sidebar-foot">
          <div className="environment">
            <span className="status-dot" />
            Demo environment
          </div>
          <p>Synthetic household data only</p>
        </div>
      </aside>
      {open ? (
        <button
          className="sidebar-scrim"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        />
      ) : null}
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-only"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </button>
            <div>
              <span className="eyebrow">Advisor workspace</span>
              <strong>{title ?? "FiduciaryOS"}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="Notifications">
              <Bell size={19} />
              <span className="notification-dot" />
            </button>
            <div className="avatar">EM</div>
            <div className="advisor-name">
              <strong>Elena Morgan</strong>
              <span>CFP® · Demo advisor</span>
            </div>
          </div>
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
