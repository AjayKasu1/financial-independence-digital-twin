import {
  Activity,
  Bell,
  ChevronRight,
  CircleAlert,
  Files,
  LayoutDashboard,
  Menu,
  Scale,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import type { DashboardResponse } from "@fidt/contracts";
import { api } from "../lib/api";
import { date } from "../lib/format";
import { Badge } from "./Ui";

const demoHouseholdId = "household-patel-demo";

const navigation = [
  { to: "/", label: "Advisor overview", icon: LayoutDashboard, end: true },
  { to: `/households/${demoHouseholdId}`, label: "Household twin", icon: Users, end: true },
  { to: `/households/${demoHouseholdId}/compare`, label: "Decision lab", icon: Scale },
  { to: `/households/${demoHouseholdId}/audit`, label: "Evidence & audit", icon: ShieldCheck },
  { to: "/evidence", label: "Evidence library", icon: Files, system: true },
  { to: "/connectors", label: "Data connectors", icon: Activity, system: true }
];

type OpenMenu = "notifications" | "advisor" | null;

export function AppShell() {
  const [open, setOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [notifications, setNotifications] = useState<DashboardResponse["events"] | null>(null);
  const [notificationError, setNotificationError] = useState("");
  const actionsRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location.pathname]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (openMenu && !actionsRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const dismissWithKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismissWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismissWithKeyboard);
    };
  }, [openMenu]);
  useEffect(() => {
    if (openMenu !== "notifications" || notifications) return;
    void api
      .dashboard()
      .then((data) => {
        setNotifications(data.events);
        setNotificationError("");
      })
      .catch((reason: unknown) =>
        setNotificationError(reason instanceof Error ? reason.message : "Unknown error")
      );
  }, [notifications, openMenu]);
  const navigationTitle = navigation
    .filter((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
    )
    .sort((left, right) => right.to.length - left.to.length)[0]?.label;
  const title = location.pathname.includes("/passports/")
    ? "Decision Passport"
    : location.pathname.includes("/recommendation")
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
          {navigation
            .filter((item) => !item.system)
            .map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                {...(end === undefined ? {} : { end })}
                onClick={() => {
                  setOpen(false);
                  setOpenMenu(null);
                }}
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <Icon size={18} />
                <span>{label}</span>
                <ChevronRight className="nav-arrow" size={15} />
              </NavLink>
            ))}
          <p className="nav-label nav-label-spaced">System</p>
          {navigation
            .filter((item) => item.system)
            .map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => {
                  setOpen(false);
                  setOpenMenu(null);
                }}
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <Icon size={18} />
                <span>{label}</span>
                <ChevronRight className="nav-arrow" size={15} />
              </NavLink>
            ))}
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
          <div className="topbar-actions" ref={actionsRef}>
            <div className="action-anchor">
              <button
                className="icon-button"
                aria-label="Notifications"
                aria-expanded={openMenu === "notifications"}
                aria-controls="notifications-menu"
                onClick={() => {
                  setNotificationError("");
                  setOpenMenu((current) => (current === "notifications" ? null : "notifications"));
                }}
              >
                <Bell size={19} />
                <span className="notification-dot" />
              </button>
              {openMenu === "notifications" ? (
                <section
                  className="topbar-popover notification-popover"
                  id="notifications-menu"
                  aria-label="Notifications"
                >
                  <div className="popover-heading">
                    <div>
                      <span className="eyebrow">Decision queue</span>
                      <strong>Notifications</strong>
                    </div>
                    <Badge tone="warn">{notifications?.length ?? "…"}</Badge>
                  </div>
                  {notificationError ? (
                    <div className="popover-state popover-error">
                      <CircleAlert size={17} />
                      <span>{notificationError}</span>
                    </div>
                  ) : notifications ? (
                    <div className="notification-list">
                      {notifications.slice(0, 4).map((notification) => (
                        <Link
                          key={notification.id}
                          to={`/households/${notification.householdId}/compare?event=${encodeURIComponent(notification.id)}`}
                          onClick={() => setOpenMenu(null)}
                        >
                          <span
                            className={`notification-severity severity-${notification.severity.toLowerCase()}`}
                          />
                          <span>
                            <strong>{notification.title}</strong>
                            <small>{date(notification.occurredAt)}</small>
                          </span>
                          <ChevronRight size={15} />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="popover-state">Loading decision signals…</div>
                  )}
                  <Link className="popover-footer" to="/" onClick={() => setOpenMenu(null)}>
                    Open advisor overview
                    <ChevronRight size={15} />
                  </Link>
                </section>
              ) : null}
            </div>
            <div className="action-anchor">
              <button
                className="advisor-button"
                aria-label="Advisor profile and environment"
                aria-expanded={openMenu === "advisor"}
                aria-controls="advisor-menu"
                onClick={() => setOpenMenu((current) => (current === "advisor" ? null : "advisor"))}
              >
                <span className="avatar">EM</span>
                <span className="advisor-name">
                  <strong>Elena Morgan</strong>
                  <span>CFP® · Demo advisor</span>
                </span>
              </button>
              {openMenu === "advisor" ? (
                <section
                  className="topbar-popover advisor-popover"
                  id="advisor-menu"
                  aria-label="Advisor profile"
                >
                  <div className="profile-summary">
                    <span className="avatar profile-avatar">EM</span>
                    <div>
                      <strong>Elena Morgan, CFP®</strong>
                      <span>Demo advisor · FiduciaryOS</span>
                    </div>
                  </div>
                  <dl className="profile-facts">
                    <div>
                      <dt>Environment</dt>
                      <dd>
                        <span className="status-dot" /> Synthetic demo
                      </dd>
                    </div>
                    <div>
                      <dt>Authority</dt>
                      <dd>Human review required</dd>
                    </div>
                    <div>
                      <dt>Client data</dt>
                      <dd>None · demonstration only</dd>
                    </div>
                  </dl>
                  <Link
                    className="profile-link"
                    to={`/households/${demoHouseholdId}/audit`}
                    onClick={() => setOpenMenu(null)}
                  >
                    <UserRound size={16} />
                    View advisor audit activity
                    <ChevronRight size={15} />
                  </Link>
                </section>
              ) : null}
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
