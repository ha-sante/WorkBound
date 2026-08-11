import { useEffect, useState, useCallback, useRef } from "react";
import Scrollable from "../components/scrollable";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";
import { type Tab } from "../components/settings/types";
import { SettingsSidebar } from "../components/settings/settings_sidebar";
import { ProfilePanel } from "../components/settings/profile_panel";
import { InterfacePanel } from "../components/settings/interface_panel";
import { SignaturesPanel } from "../components/settings/signatures_panel";
import { PreferencesPanel } from "../components/settings/preferences_panel";
import { NotificationsPanel } from "../components/settings/notifications_panel";
import { AutomationsPanel } from "../components/settings/automations_panel";
import { IntelligencePanel } from "../components/settings/intelligence_panel";
import { FilteredViewsPanel } from "../components/settings/filtered_views_panel";
import { TemplatesPanel } from "../components/settings/templates_panel";
import { NotesPanel } from "../components/settings/notes_panel";
import { LabelsPanel } from "../components/settings/labels_panel";
import { ContactsPanel } from "../components/settings/contacts_panel";
import { DeveloperPanel } from "../components/settings/developer_panel";
import { useAccount } from "../hooks/use_current_account";
import type { SyncEngineState } from "../hooks/sync_state";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  onDisconnect: () => void;
  syncState: SyncEngineState;
  initialTab?: Tab;
};

function SettingsModal({ isOpen, onClose, onLogout, onDisconnect, syncState, initialTab }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("Preferences");
  const prevOpen = useRef(false);
  const account = useAccount();
  const account_id = account?.id ?? "";

  useEffect(() => {
    if (isOpen && !prevOpen.current && initialTab) {
      setActiveTab(initialTab);
    }
    prevOpen.current = isOpen;
  }, [isOpen, initialTab]);
  const [diag, setDiag] = useState<DiagData | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const fetchDiag = useCallback(async () => {
    setDiagLoading(true);
    try {
      const data = await rpc.request(messages.diag_snapshot);
      setDiag(data as DiagData);
    } catch {
      setDiag(null);
    }
    setDiagLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && activeTab === "Developer") {
      fetchDiag();
    }
  }, [isOpen, activeTab, fetchDiag]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex w-9/12 h-[75vh] rounded-xl bg-white shadow-2xl overflow-hidden">
        <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} onLogout={onLogout} />
        <Scrollable className="flex-1">
          {activeTab === "Profile"
            ? <ProfilePanel account={account} onLogout={onLogout} onDisconnect={onDisconnect} />
            : activeTab === "Interface"
            ? <InterfacePanel />
            : activeTab === "Signatures"
            ? <SignaturesPanel account={account} />
            : activeTab === "Preferences"
            ? <PreferencesPanel />
            : activeTab === "Notifications"
            ? <NotificationsPanel />
            : activeTab === "Automations"
            ? <AutomationsPanel account_id={account_id} />
            : activeTab === "Intelligence"
            ? <IntelligencePanel account_id={account_id} />
            : activeTab === "Filtered Views"
            ? <FilteredViewsPanel account_id={account_id} />
            : activeTab === "Templates"
            ? <TemplatesPanel account_id={account_id} />
            : activeTab === "Notes"
            ? <NotesPanel account_id={account_id} />
            : activeTab === "Labels"
            ? <LabelsPanel account_id={account_id} />
            : activeTab === "Contacts"
            ? <ContactsPanel account_id={account_id} />
            : activeTab === "Developer"
            ? <DeveloperPanel diag={diag} loading={diagLoading} onRefresh={fetchDiag} syncState={syncState} account_id={account_id} />
            : null
          }
        </Scrollable>
      </div>
    </div>
  );
}

export default SettingsModal;
