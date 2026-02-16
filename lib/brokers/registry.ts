import type { BrokerId, ImportType, BrokerParser } from "@/lib/brokers/types";
import { parseTosOrderHistory } from "@/lib/brokers/tos/parseTosOrderHistory";

const registry: Record<string, BrokerParser> = {
  "tos:order_history": parseTosOrderHistory,
  "thinkorswim:order_history": parseTosOrderHistory,
};

export function getBrokerParser(broker: BrokerId, importType: ImportType): BrokerParser | null {
  return registry[`${broker}:${importType}`] ?? null;
}
