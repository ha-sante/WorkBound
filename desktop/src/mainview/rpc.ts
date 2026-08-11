import { Electroview } from "electrobun/view";
import type { WorkBoundRPCSchema } from "@/shared/rpc_schema";

export const rpc = Electroview.defineRPC<WorkBoundRPCSchema>({
  maxRequestTime: 30_000,
  handlers: { requests: {}, messages: {} },
});

new Electroview({ rpc });
