import { Terminal, LogOut } from "lucide-react";
import { type Tab, sidebarGroups } from "./types";

export function SettingsSidebar({ activeTab, onTabChange, onLogout }: {
  activeTab: Tab;
  onTabChange: (t: Tab) => void;
  onLogout: () => void;
}) {
  const tab_class = (active: boolean) => `flex items-center rounded-md transition-colors cursor-pointer justify-center p-2 w-10 h-10 lg:px-3 lg:py-1.5 lg:w-full lg:h-auto lg:justify-start lg:gap-3 lg:text-sm ${
    active
      ? "bg-black/[0.06] text-sidebar-text"
      : "text-sidebar-text hover:bg-black/5"
  }`;

  return (
    <aside className="w-[60px] lg:w-[220px] bg-sidebar flex flex-col pt-6">
      <p className="hidden lg:block text-xs font-medium text-sidebar-text uppercase tracking-wider px-5">Settings</p>
      <nav className="flex-1 min-h-0 overflow-y-auto p-1 space-y-0 lg:space-y-1 flex flex-col items-center lg:px-2 lg:items-stretch">
        {sidebarGroups.map((group, gi) => (
          <div key={gi} className="flex flex-col items-center lg:items-stretch">
            {gi > 0 && <hr className="border-border-subtle mx-1 lg:mx-2 my-0 lg:my-3 w-10 lg:w-auto" />}
            <div className="space-y-0 lg:space-y-1 flex flex-col items-center lg:items-stretch">
              {group.items.map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => onTabChange(key)}
                  title={key}
                  aria-label={key}
                  className={tab_class(activeTab === key)}>
                  <Icon size={15} className="w-[15px] h-[15px] lg:w-4 lg:h-4 shrink-0 text-sidebar-text" />
                  <span className="hidden lg:inline">{key}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="shrink-0 p-1 lg:px-2 pb-4 space-y-0 lg:space-y-1 flex flex-col items-center lg:items-stretch">
        <button
          onClick={() => onTabChange("Developer")}
          title="Developer"
          aria-label="Developer"
          className={tab_class(activeTab === "Developer")}
        >
          <Terminal size={15} className="w-[15px] h-[15px] lg:w-4 lg:h-4 shrink-0" />
          <span className="hidden lg:inline">Developer</span>
        </button>
        <button
          onClick={onLogout}
          title="Log Out"
          aria-label="Log Out"
          className="flex items-center rounded-md text-sidebar-text hover:bg-black/5 transition-colors cursor-pointer justify-center p-2 w-10 h-10 lg:px-3 lg:py-1.5 lg:w-full lg:justify-start lg:gap-3 lg:text-sm"
        >
          <LogOut size={15} className="w-[15px] h-[15px] lg:w-4 lg:h-4 shrink-0" />
          <span className="hidden lg:inline">Log Out</span>
        </button>
      </div>
    </aside>
  );
}