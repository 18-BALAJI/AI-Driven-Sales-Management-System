import { describe, it, expect } from "vitest";
import { performLinearRegression, predictFuture } from "../lib/ml";

describe("ML Engine & Forecasting Calculations", () => {
  it("should correctly compute slope, intercept, and R2 score for upward trend", () => {
    const values = [100, 200, 300, 400, 500];
    const { slope, intercept, r2 } = performLinearRegression(values);
    expect(slope).toBeCloseTo(100);
    expect(intercept).toBeCloseTo(100);
    expect(r2).toBeCloseTo(1.0);
  });

  it("should accurately predict future period values", () => {
    const values = [100, 200, 300, 400, 500];
    const { slope, intercept } = performLinearRegression(values);
    const predictions = predictFuture(slope, intercept, values.length, 3);
    expect(predictions).toEqual([600, 700, 800]);
  });

  it("should handle minimal data series safely", () => {
    const { slope, intercept, r2 } = performLinearRegression([100]);
    expect(slope).toBe(0);
    expect(intercept).toBe(100);
    expect(r2).toBe(0);
  });
});
