import { executeAllPendingActions } from "@tinypersonal/backend-api";
import { directTextResponse } from "./response-stream";

export async function handleConfirmation(
  ownerKey: string,
  sessionId: string,
  userMessageId: string,
  approved: boolean,
  responseMessageId?: string,
) {
  let responseText: string;
  try {
    const executions = await executeAllPendingActions(ownerKey, sessionId, approved);
    if (executions.length === 0) {
      responseText = "ไม่มีรายการที่รอการยืนยันครับ กรุณาส่งคำสั่งที่ต้องการอีกครั้ง";
    } else if (!approved) {
      responseText = `ยกเลิกข้อเสนอที่รอยืนยัน ${executions.length} รายการแล้วครับ`;
    } else {
      const summaries = executions.map(({ action }) => `- ${action.summary}`).join("\n");
      responseText = `ดำเนินการสำเร็จ ${executions.length} รายการครับ\n${summaries}`;
    }
  } catch (error) {
    responseText = `ดำเนินการยืนยันไม่สำเร็จครับ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"}`;
  }

  return directTextResponse(
    ownerKey,
    sessionId,
    userMessageId,
    responseText,
    responseMessageId,
  );
}
