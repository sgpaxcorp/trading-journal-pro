export type AlertPopupQueueItem = { id: string };

export function mergeAlertPopupQueue<T extends AlertPopupQueueItem>(input: {
  current: T[];
  incoming: T[];
  activeEventId?: string | null;
  suppressedEventIds?: ReadonlySet<string>;
}): T[] {
  const blocked = new Set(input.suppressedEventIds ?? []);
  if (input.activeEventId) blocked.add(input.activeEventId);

  const merged = input.current.filter((event) => !blocked.has(event.id));
  const seen = new Set(merged.map((event) => event.id));
  for (const event of input.incoming) {
    if (blocked.has(event.id) || seen.has(event.id)) continue;
    merged.unshift(event);
    seen.add(event.id);
  }
  return merged;
}

export function removeAlertPopupEvent<T extends AlertPopupQueueItem>(queue: T[], eventId?: string | null): T[] {
  if (!eventId) return queue;
  return queue.filter((event) => event.id !== eventId);
}
