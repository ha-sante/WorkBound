import { workbound_config } from "@/shared/config";

const limit = Number(workbound_config.ATTACHMENT_SIZE_LIMIT);
export const SOFT_LIMIT = limit || 25 * 1024 * 1024;
