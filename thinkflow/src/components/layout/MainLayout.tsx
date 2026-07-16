import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Divider, Icon, Time, type IconName } from "animal-island-ui";

export default function MainLayout() {
  const { t } = useTranslation();

  const navItems: { to: string; iconName: IconName; key: string }[] = [
    { to: "/capture", iconName: "icon-chat", key: "nav.taskAssistant" },
    { to: "/", iconName: "icon-variant", key: "nav.taskBoard" },
    { to: "/goals", iconName: "icon-helicopter", key: "nav.goals" },
    { to: "/focus", iconName: "icon-miles", key: "nav.focusMode" },
    { to: "/briefing", iconName: "icon-design", key: "nav.dailyBrief" },
    { to: "/fable", iconName: "icon-map", key: "nav.fable" },
    { to: "/memory", iconName: "icon-shopping", key: "nav.memory" },
  ];

  return (
    <div className="flex h-screen" style={{ background: "#f8f8f0" }}>
      <aside
        className="w-56 flex flex-col p-4 gap-1"
        style={{
          borderRight: "2px solid #e8e2d6",
          background: "url('') center/cover, #f8f8f0",
        }}
      >
        <h1
          className="px-3 py-2"
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "#725d42",
            letterSpacing: -0.3,
          }}
        >
          {t("app.name")}
        </h1>
        <Divider />
        <nav className="flex flex-col gap-0.5 mt-2">
          {navItems.map(({ to, iconName, key }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 text-sm transition-all ${
                  isActive ? "" : ""
                }`
              }
              style={({ isActive }) => ({
                borderRadius: 12,
                fontWeight: 600,
                fontSize: 14,
                transition: "all 0.15s",
                color: isActive ? "#fff" : "#8a7b66",
                background: isActive ? "#B7C6E5" : "transparent",
              })}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#d6dff0";
              }}
              onMouseLeave={(e) => {
                const isActive = e.currentTarget.getAttribute("aria-current") === "page";
                e.currentTarget.style.background = isActive ? "#B7C6E5" : "transparent";
              }}
            >
              <Icon name={iconName} size={20} />
              {t(key)}
            </NavLink>
          ))}
        </nav>
        <Divider />
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          <Time className="shrink-0 scale-50" />
        </div>
        <NavLink
          to="/settings"
          className="flex items-center gap-3 px-3 py-2 text-sm transition-all"
          style={({ isActive }) => ({
            borderRadius: 12,
            fontWeight: 600,
            fontSize: 14,
            transition: "all 0.15s",
            color: isActive ? "#fff" : "#8a7b66",
            background: isActive ? "#B7C6E5" : "transparent",
          })}
        >
          <Icon name="icon-critterpedia" size={18} />
          {t("nav.settings")}
        </NavLink>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
