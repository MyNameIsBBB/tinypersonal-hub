import { describe, expect, it } from "vitest";
import { classifyCodingInstructionReadOnly } from "./jarvisService";

describe("coding instruction classification", () => {
  it("treats an explicit Thai no-edit inspection as read-only", () => {
    expect(classifyCodingInstructionReadOnly("ตรวจ repository ปัจจุบัน เช็ก branch, git status และแสดงไฟล์ใน root โดยห้ามแก้ไขไฟล์")).toBe(true);
  });

  it("treats an English no-edit inspection as read-only", () => {
    expect(classifyCodingInstructionReadOnly("Inspect git status and root files; do not modify anything")).toBe(true);
  });

  it("keeps an implementation request mutating", () => {
    expect(classifyCodingInstructionReadOnly("สร้าง Project.md และแก้ไข README")).toBe(false);
  });
});
