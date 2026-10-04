import { describe, it, expect } from "vitest";

// Identifier Normalization Logic Unit Tests
function detectAndNormalizeIdentifier(raw: str): { identifier: string; type: "email" | "phone" } {
  const cleaned = raw.trim();
  if (!cleaned) throw new Error("Identifier cannot be empty.");

  if (cleaned.includes("@")) {
    const emailRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
    if (!emailRegex.test(cleaned)) throw new Error("Please enter a valid email address.");
    return { identifier: cleaned.toLowerCase(), type: "email" };
  }

  const digits = cleaned.replace(/[^\d+]/g, "");
  if (/^\+?[1-9]\d{6,14}$/.test(digits)) {
    const normalized = digits.startsWith("+") ? digits : "+" + digits;
    return { identifier: normalized, type: "phone" };
  }
  if (/^\d{10}$/.test(digits)) {
    return { identifier: digits.startsWith("+") ? digits : "+1" + digits, type: "phone" };
  }

  throw new Error("Please enter a valid email address or phone number.");
}

// Simulated OTP State Machine for Verification Tests
class MockOTPEngine {
  attempts = 0;
  maxAttempts = 5;
  used = false;
  expiresAt: number;
  lastResendAt: number;
  otpHash: string;

  constructor(public identifier: string, public plainOtp: string, cooldownSec = 60, expirySec = 300) {
    this.otpHash = `hashed:${plainOtp}`;
    const now = Date.now();
    this.lastResendAt = now;
    this.expiresAt = now + expirySec * 1000;
  }

  resend(now = Date.now()): { success: boolean; message?: string } {
    const elapsedSec = (now - this.lastResendAt) / 1000;
    if (elapsedSec < 60) {
      const remaining = Math.ceil(60 - elapsedSec);
      return { success: false, message: `Please wait ${remaining} seconds before requesting another OTP.` };
    }
    this.used = true; // invalidate old
    this.lastResendAt = now;
    return { success: true };
  }

  verify(inputOtp: string, now = Date.now()): { success: boolean; error?: string } {
    if (this.used) {
      return { success: false, error: "OTP has already been used. Please request a new OTP." };
    }
    if (now > this.expiresAt) {
      this.used = true;
      return { success: false, error: "OTP has expired. Please request a new OTP." };
    }
    if (this.attempts >= this.maxAttempts) {
      this.used = true;
      return { success: false, error: "Too many failed attempts. Please request a new OTP." };
    }

    if (`hashed:${inputOtp}` !== this.otpHash) {
      this.attempts += 1;
      const remaining = this.maxAttempts - this.attempts;
      if (this.attempts >= this.maxAttempts) {
        this.used = true;
        return { success: false, error: "Too many failed attempts. Please request a new OTP." };
      }
      return { success: false, error: `Invalid OTP. ${remaining} attempts remaining.` };
    }

    this.used = true;
    return { success: true };
  }
}

// Role Authorization Matrix Check
function canAccessResource(userRole: "owner" | "manager" | "analyst", requiredRoles: string[]): boolean {
  return requiredRoles.includes(userRole);
}

describe("OTP Authentication & Authorization Suite", () => {
  describe("Identifier Detection & Normalization", () => {
    it("should correctly detect and lowercase valid email addresses", () => {
      const res = detectAndNormalizeIdentifier("Owner@ProfitNavigator.COM");
      expect(res.type).toBe("email");
      expect(res.identifier).toBe("owner@profitnavigator.com");
    });

    it("should correctly detect and normalize mobile phone numbers", () => {
      const res1 = detectAndNormalizeIdentifier("+1 (555) 010-0001");
      expect(res1.type).toBe("phone");
      expect(res1.identifier).toBe("+15550100001");

      const res2 = detectAndNormalizeIdentifier("5550100002");
      expect(res2.type).toBe("phone");
      expect(res2.identifier).toBe("+15550100002");
    });

    it("should reject malformed identifiers", () => {
      expect(() => detectAndNormalizeIdentifier("not-an-email-or-phone")).toThrow();
      expect(() => detectAndNormalizeIdentifier("123")).toThrow();
    });
  });

  describe("OTP Verification State Machine", () => {
    it("should verify valid OTP successfully", () => {
      const engine = new MockOTPEngine("owner@profitnavigator.com", "849201");
      const result = engine.verify("849201");
      expect(result.success).toBe(true);
      expect(engine.used).toBe(true);
    });

    it("should reject invalid OTP code and decrement remaining attempts", () => {
      const engine = new MockOTPEngine("owner@profitnavigator.com", "849201");
      const res1 = engine.verify("000000");
      expect(res1.success).toBe(false);
      expect(res1.error).toContain("4 attempts remaining");
      expect(engine.attempts).toBe(1);
    });

    it("should lock out and invalidate OTP after maximum 5 failed attempts", () => {
      const engine = new MockOTPEngine("owner@profitnavigator.com", "849201");
      for (let i = 0; i < 4; i++) {
        engine.verify("111111");
      }
      expect(engine.attempts).toBe(4);
      const fifthAttempt = engine.verify("222222");
      expect(fifthAttempt.success).toBe(false);
      expect(fifthAttempt.error).toContain("Too many failed attempts");
      expect(engine.used).toBe(true);
    });

    it("should reject expired OTPs", () => {
      const engine = new MockOTPEngine("owner@profitnavigator.com", "849201");
      const expiredTime = Date.now() + 301 * 1000; // 5 mins 1 sec later
      const result = engine.verify("849201", expiredTime);
      expect(result.success).toBe(false);
      expect(result.error).toContain("OTP has expired");
    });

    it("should enforce resend cooldown of 60 seconds", () => {
      const engine = new MockOTPEngine("owner@profitnavigator.com", "849201");
      const immediateResend = engine.resend(Date.now() + 10 * 1000); // 10s later
      expect(immediateResend.success).toBe(false);
      expect(immediateResend.message).toContain("Please wait 50 seconds");

      const validResend = engine.resend(Date.now() + 61 * 1000); // 61s later
      expect(validResend.success).toBe(true);
    });

    it("should prevent reuse of previously validated OTPs", () => {
      const engine = new MockOTPEngine("owner@profitnavigator.com", "849201");
      engine.verify("849201"); // first verify succeeds
      const reuse = engine.verify("849201"); // second verify fails
      expect(reuse.success).toBe(false);
      expect(reuse.error).toContain("already been used");
    });
  });

  describe("Role-Based Authorization (RBAC)", () => {
    it("should allow ADMIN (owner & analyst) to access sensitive settings", () => {
      expect(canAccessResource("owner", ["owner", "analyst"])).toBe(true);
      expect(canAccessResource("analyst", ["owner", "analyst"])).toBe(true);
    });

    it("should prevent USER (manager) from accessing ADMIN-only endpoints", () => {
      expect(canAccessResource("manager", ["owner", "analyst"])).toBe(false);
    });

    it("should allow USER (manager) to access standard store operations", () => {
      expect(canAccessResource("manager", ["owner", "manager", "analyst"])).toBe(true);
    });
  });
});
