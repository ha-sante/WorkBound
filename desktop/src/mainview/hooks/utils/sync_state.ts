export type SyncEngineState = {
  backfill: {
    status: "idle" | "syncing" | "done" | "error";
    total: number;
    totalMessages: number | null;
    totalEmails: number;
    error: string | null;
  };
  newfill: {
    isSyncing: boolean;
  };
  hasCompletedBackfill: boolean;
};

export type Action =
  | { type: "BACKFILL_START"; total?: number; totalMessages?: number | null; resume?: boolean }
  | { type: "BACKFILL_PROGRESS"; total: number; totalMessages?: number | null }
  | { type: "BACKFILL_DONE" }
  | { type: "BACKFILL_ERROR"; error?: string | null }
  | { type: "UPDATE_TOTAL_EMAILS"; total: number }
  | { type: "NEWFILL_SYNCING" }
  | { type: "NEWFILL_COMPLETE" }
  | { type: "NEWFILL_ERROR" }
  | { type: "LOGIN" }
  | { type: "RESET" };

export const initialSyncState: SyncEngineState = {
  backfill: { status: "idle", total: 0, totalMessages: null, totalEmails: 0, error: null },
  newfill: { isSyncing: false },
  hasCompletedBackfill: false,
};

export function sync_reducer(state: SyncEngineState, action: Action): SyncEngineState {
  switch (action.type) {
    case "BACKFILL_PROGRESS":
      return {
        ...state,
        backfill: {
          ...state.backfill,
          status: "syncing",
          total: action.total,
          totalMessages: action.totalMessages ?? state.backfill.totalMessages,
          error: null,
        },
      };
    case "BACKFILL_DONE":
      return {
        ...state,
        hasCompletedBackfill: true,
        backfill: { ...state.backfill, status: "done", error: null },
      };
    case "BACKFILL_START":
      return {
        ...state,
        backfill: {
          status: "syncing",
          total: action.total ?? 0,
          totalMessages: action.totalMessages ?? null,
          totalEmails: 0,
          error: null,
        },
        hasCompletedBackfill: false,
      };
    case "BACKFILL_ERROR":
      return {
        ...state,
        backfill: {
          ...state.backfill,
          status: "error",
          totalEmails: 0,
          error: action.error ?? null,
        },
      };
    case "UPDATE_TOTAL_EMAILS":
      return {
        ...state,
        backfill: { ...state.backfill, totalEmails: action.total },
      };
    case "NEWFILL_SYNCING":
      if (state.newfill.isSyncing) return state;
      return {
        ...state,
        newfill: { isSyncing: true },
      };
    case "NEWFILL_COMPLETE":
      if (!state.newfill.isSyncing) return state;
      return {
        ...state,
        newfill: { isSyncing: false },
      };
    case "NEWFILL_ERROR":
      if (!state.newfill.isSyncing) return state;
      return {
        ...state,
        newfill: { isSyncing: false },
      };
    case "LOGIN":
      return {
        ...state,
        backfill: { status: "syncing", total: 0, totalMessages: null, totalEmails: 0, error: null },
        hasCompletedBackfill: false,
      };
    case "RESET":
      return { ...initialSyncState };
  }
}
