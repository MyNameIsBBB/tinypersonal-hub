import { describe, expect, it } from "vitest";
import { scopeToolsForMessage } from "./toolScoper";
import {
  resolveConversationReference,
  routeWithState,
  stateAfterToolResult,
  stateFromScope,
  type ConversationState,
} from "./conversationState";

const updatedAt = new Date().toISOString();

describe("conversation state routing", () => {
  it("uses an active create tool for a time-only continuation", () => {
    const state: ConversationState = {
      activeIntent: "schedule.mutate",
      activeDomain: "schedule",
      activeTool: "createScheduleItem",
      missingFields: ["endTime"],
      updatedAt,
    };
    const scope = routeWithState("11 โมง", scopeToolsForMessage("11 โมง"), state);
    expect(scope).toMatchObject({
      primaryIntent: "schedule.mutate",
      allowedTools: ["getSchedule", "createScheduleItem"],
      confidence: 0.96,
    });
  });

  it("resolves an ordinal reference and scopes an update", () => {
    const state: ConversationState = {
      activeIntent: "schedule.query",
      activeDomain: "schedule",
      activeTool: "getSchedule",
      recentEntities: [
        { type: "schedule", id: "adt-id", label: "ADT" },
        { type: "schedule", id: "meeting-id", label: "KU Tech" },
      ],
      updatedAt,
    };
    const resolved = resolveConversationReference(state, "อันแรกเลื่อนไปวันพุธ");
    expect(resolved?.referencedEntity).toEqual({ type: "schedule", id: "adt-id", label: "ADT" });
    expect(routeWithState(
      "อันแรกเลื่อนไปวันพุธ",
      scopeToolsForMessage("อันแรกเลื่อนไปวันพุธ"),
      resolved,
    )).toMatchObject({
      primaryIntent: "schedule.mutate",
      allowedTools: ["getSchedule", "updateTaskStatus", "updateScheduleItem"],
    });
  });

  it("captures bounded entities and a pending confirmation from tool output", () => {
    const queried = stateAfterToolResult(null, "getSchedule", {
      items: [{ id: "adt-id", title: "ADT" }, { id: "meeting-id", title: "KU Tech" }],
    });
    expect(queried?.recentEntities).toHaveLength(2);
    const pending = stateAfterToolResult(
      stateFromScope(scopeToolsForMessage("เพิ่มนัดพรุ่งนี้"), queried),
      "createScheduleItem",
      { confirmation: { id: "pending-id" } },
    );
    expect(pending).toMatchObject({ activeTool: "createScheduleItem", pendingActionId: "pending-id" });
  });

  it("resolves checklist references from a task detail result", () => {
    const state = stateAfterToolResult(null, "getTask", { tasks: [{
      id: "task-1",
      title: "EGAT",
      checklistItems: [{ id: "check-1", title: "ทำ UI" }, { id: "check-2", title: "test" }],
    }] });
    const resolved = resolveConversationReference(state, "ติ๊กอันแรก");
    expect(resolved?.referencedEntity).toEqual({ type: "taskChecklistItem", id: "check-1", label: "ทำ UI" });
    expect(routeWithState("ติ๊กอันแรก", scopeToolsForMessage("ติ๊กอันแรก"), resolved)).toMatchObject({
      primaryIntent: "task.mutate",
      allowedTools: ["getTasks", "getTask", "updateTaskChecklistItem"],
    });
  });
});
