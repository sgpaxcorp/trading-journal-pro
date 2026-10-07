import { describe, expect, it } from "vitest";

import { mergeAlertPopupQueue, removeAlertPopupEvent } from "@/lib/alertPopupQueue";

describe("alert popup queue", () => {
  it("does not enqueue the event already shown in the modal", () => {
    const queue = mergeAlertPopupQueue({
      current: [],
      incoming: [{ id: "active" }],
      activeEventId: "active",
    });

    expect(queue).toEqual([]);
  });

  it("keeps a closed event suppressed for the current session", () => {
    const queue = mergeAlertPopupQueue({
      current: [],
      incoming: [{ id: "closed" }, { id: "new" }],
      suppressedEventIds: new Set(["closed"]),
    });

    expect(queue).toEqual([{ id: "new" }]);
  });

  it("removes queued copies when an event closes", () => {
    expect(removeAlertPopupEvent([{ id: "other" }, { id: "closing" }, { id: "closing" }], "closing"))
      .toEqual([{ id: "other" }]);
  });
});
