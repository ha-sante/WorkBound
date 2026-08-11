import { User, Bell, Settings, Signature, Zap, FileText, StickyNote, Users, Tag, Brain, Monitor, ListFilter, type LucideIcon } from "lucide-react";

export type Tab = "Profile" | "Interface" | "Signatures" | "Preferences" | "Notifications"
  | "Automations" | "Templates" | "Notes" | "Labels"
  | "Contacts" | "Intelligence" | "Filtered Views" | "Developer";

export type AccountDiag = DiagData["accounts"][number];

export type SidebarGroup = {
  items: { key: Tab; icon: LucideIcon }[];
};

export const sidebarGroups: SidebarGroup[] = [
  {
    items: [
      { key: "Profile", icon: User },
      { key: "Interface", icon: Monitor },
      { key: "Preferences", icon: Settings },
      { key: "Notifications", icon: Bell },
    ],
  },
  {
    items: [
      { key: "Signatures", icon: Signature },
      { key: "Automations", icon: Zap },
      { key: "Templates", icon: FileText },
      { key: "Notes", icon: StickyNote },
      { key: "Contacts", icon: Users },
      { key: "Labels", icon: Tag },
    ],
  },
  {
    items: [
      { key: "Intelligence", icon: Brain },
      { key: "Filtered Views", icon: ListFilter },
    ],
  },
];
