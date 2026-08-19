import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { ComponentErrorBoundary } from "@/app/components/ComponentErrorBoundary";

test("M81: ComponentErrorBoundary khởi tạo với state không lỗi", () => {
  const boundary = new ComponentErrorBoundary({ children: "Normal Content" });
  assert.equal(boundary.state.hasError, false);
  assert.equal(boundary.state.error, null);
});

test("M81: getDerivedStateFromError cập nhật hasError = true khi có lỗi", () => {
  const sampleError = new Error("Chart rendering failed");
  const newState = ComponentErrorBoundary.getDerivedStateFromError(sampleError);

  assert.equal(newState.hasError, true);
  assert.equal(newState.error, sampleError);
});

test("M81: handleReset khôi phục lại trạng thái ban đầu và gọi callback onReset", () => {
  let resetTriggered = false;
  let stateUpdated: { hasError: boolean; error: Error | null } | null = null;

  const boundary = new ComponentErrorBoundary({
    children: "Content",
    onReset: () => {
      resetTriggered = true;
    },
  });

  // Mock setState của React Component
  boundary.setState = (updater: any) => {
    stateUpdated = typeof updater === "function" ? updater(boundary.state) : updater;
  };

  boundary.handleReset();

  assert.equal(resetTriggered, true, "onReset callback phải được gọi");
  assert.deepEqual(
    stateUpdated,
    { hasError: false, error: null },
    "State phải được reset về không có lỗi",
  );
});
