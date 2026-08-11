import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { messages } from "@/shared/rpc_messages";
import { rpc } from "../rpc";

type ConfigContextValue = {
  entries: ConfigEntryWire[];
  get: (key: string) => string | undefined;
  refresh: () => Promise<void>;
};

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ConfigEntryWire[]>([]);

  const refresh = useCallback(async () => {
    try {
      const data = await rpc.request(messages.config_list) as ConfigEntryWire[];
      setEntries(data ?? []);
    } catch { setEntries([]); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const get = useCallback((key: string) => {
    return entries.find((e) => e.key === key)?.displayValue;
  }, [entries]);

  return (
    <ConfigContext.Provider value={{ entries, get, refresh }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig must be used within a ConfigProvider");
  return ctx;
}
