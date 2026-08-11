import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { accountsAtom, currentAccountIdAtom } from "../state";

export function useAccount(): AccountRowWire | null {
  const account_id = useAtomValue(currentAccountIdAtom);
  const accounts = useAtomValue(accountsAtom);
  return useMemo(() => accounts.find((a: AccountRowWire) => a.id === account_id) ?? null, [accounts, account_id]);
}
