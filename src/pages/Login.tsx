import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import {
  Zap,
  Loader2,
  Briefcase,
  Store,
  LineChart,
  Mail,
  Phone,
  User,
  Check,
  ArrowLeft,
  KeyRound,
  RefreshCw,
  Clock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { roleLabels, type UserRole } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

const roleOptions: { role: UserRole; icon: typeof Briefcase; blurb: string }[] = [
  { role: "owner", icon: Briefcase, blurb: "Full access to every dashboard & metric" },
  { role: "manager", icon: Store, blurb: "Day-to-day shop operations & transactions" },
  { role: "analyst", icon: LineChart, blurb: "Pricing approval & AI model insights" },
];

const demoAccounts = [
  {
    role: "owner" as UserRole,
    name: "Business Owner",
    email: "owner@profitnavigator.com",
    phone: "+15550100001",
    pass: "owner123",
    label: "Owner",
  },
  {
    role: "manager" as UserRole,
    name: "Shop Manager",
    email: "manager@profitnavigator.com",
    phone: "+15550100002",
    pass: "manager123",
    label: "Manager",
  },
  {
    role: "analyst" as UserRole,
    name: "Financial Analyst",
    email: "analyst@profitnavigator.com",
    phone: "+15550100003",
    pass: "analyst123",
    label: "Analyst",
  },
];

export default function Login() {
  const { user, loading, sendOTP, verifyOTPCode, resendOTPCode, register, login } = useAuth();
  const navigate = useNavigate();

  // Mode: "login" (OTP login) vs "signup"
  const [mode, setMode] = useState<"login" | "signup">("login");
  
  // Step: 1 = Request OTP, 2 = Verify OTP
  const [step, setStep] = useState<1 | 2>(1);

  // Form Fields
  const [identifier, setIdentifier] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("owner");
  
  // Dev Helper Code for display
  const [devCode, setDevCode] = useState<string | null>(null);

  // Loading & Submitting states
  const [submitting, setSubmitting] = useState(false);

  // Cooldown & Expiration Timers
  const [cooldown, setCooldown] = useState(0);       // e.g. 60 seconds
  const [expiresIn, setExpiresIn] = useState(300);   // e.g. 300 seconds (5 mins)

  // Redirect if already authenticated
  if (!loading && user) return <Navigate to="/" replace />;

  // Format countdown string: MM:SS
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Cooldown interval effect
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  // Expiration interval effect
  useEffect(() => {
    if (step !== 2 || expiresIn <= 0) return;
    const interval = setInterval(() => setExpiresIn((prev) => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [step, expiresIn]);

  // Detect input type: email vs phone
  const isEmail = identifier.includes("@");
  const isPhone = !isEmail && identifier.trim().length > 0;

  // Step 1: Request OTP
  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      toast({
        title: "Input Required",
        description: "Please enter a valid email address or phone number.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "signup") {
        if (!name.trim()) {
          toast({
            title: "Name Required",
            description: "Please enter your full name.",
            variant: "destructive",
          });
          setSubmitting(false);
          return;
        }
        await register({
          name: name.trim(),
          email: isEmail ? identifier.trim() : `${Date.now()}@profitnavigator.com`,
          phone: isPhone ? identifier.trim() : undefined,
          role,
        });
      }

      // Request OTP
      const res = await sendOTP(identifier.trim());
      if (res.debugOtp) {
        setDevCode(res.debugOtp);
        setOtpCode(res.debugOtp);
      }
      
      toast({
        title: res.cooldownActive ? "Active OTP Found" : "OTP Code Generated",
        description: res.debugOtp
          ? `Dev Code: ${res.debugOtp} (auto-filled below)`
          : res.message || "Enter the 6-digit code to log in.",
      });

      setStep(2);
      setCooldown(res.cooldown || 60);
      setExpiresIn(res.expiresIn || 300);
    } catch (err) {
      toast({
        title: "OTP Request",
        description: err instanceof Error ? err.message : "Unable to generate OTP.",
        variant: "destructive",
      });
      setStep(1);
    } finally {
      setSubmitting(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) {
      toast({
        title: "Invalid OTP",
        description: "Please enter the 6-digit OTP code.",
        variant: "destructive",
      });
      return;
    }

    if (expiresIn <= 0) {
      toast({
        title: "OTP Expired",
        description: "OTP has expired. Please request a new OTP.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const signedInUser = await verifyOTPCode(identifier.trim(), otpCode);
      toast({
        title: `Welcome back, ${signedInUser.name}`,
        description: `Signed in as ${roleLabels[signedInUser.role]}.`,
      });
      navigate("/", { replace: true });
    } catch (err) {
      toast({
        title: "Verification Failed",
        description: err instanceof Error ? err.message : "Invalid verification code.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Resend OTP Action
  const handleResend = async () => {
    if (cooldown > 0) return;
    setSubmitting(true);
    try {
      const res = await resendOTPCode(identifier.trim());
      if (res.debugOtp) {
        setDevCode(res.debugOtp);
        setOtpCode(res.debugOtp);
      }
      toast({
        title: "New OTP Sent",
        description: res.debugOtp
          ? `Dev Code: ${res.debugOtp} (auto-filled)`
          : res.message || "A fresh 6-digit code has been generated.",
      });
      setCooldown(res.cooldown || 60);
      setExpiresIn(res.expiresIn || 300);
    } catch (err) {
      toast({
        title: "Resend Failed",
        description: err instanceof Error ? err.message : "Failed to resend OTP.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Instant Demo Account Login
  const handleQuickDemo = async (acc: typeof demoAccounts[0]) => {
    setSubmitting(true);
    try {
      // First attempt instant password sign-in for demo account
      const signedIn = await login(acc.email, acc.pass);
      toast({
        title: `Welcome, ${signedIn.name}`,
        description: `Signed in as ${roleLabels[signedIn.role]}.`,
      });
      navigate("/", { replace: true });
    } catch {
      // Fallback to demo OTP generation
      setIdentifier(acc.email);
      setMode("login");
      try {
        const res = await sendOTP(acc.email);
        if (res.debugOtp) {
          setDevCode(res.debugOtp);
          setOtpCode(res.debugOtp);
        }
        toast({
          title: `Demo OTP Generated for ${acc.label}`,
          description: res.debugOtp
            ? `Dev Code: ${res.debugOtp} (auto-filled)`
            : "Enter 6-digit code to log in.",
        });
        setStep(2);
        setCooldown(res.cooldown || 60);
        setExpiresIn(res.expiresIn || 300);
      } catch (err) {
        toast({
          title: "Demo Request",
          description: err instanceof Error ? err.message : "Failed to request demo OTP.",
        });
        setStep(2);
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f6f8] flex items-center justify-center p-4 lg:p-8 font-sans text-slate-800">
      <div className="w-full max-w-6xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col lg:flex-row min-h-[720px]">
        
        {/* LEFT COLUMN — FORM */}
        <div className="flex-1 p-6 sm:p-10 lg:p-14 flex flex-col justify-between bg-white">
          <div>
            {/* Logo */}
            <div className="flex items-center gap-2 mb-8">
              <div className="h-9 w-9 rounded-xl bg-[#0d9488] flex items-center justify-center text-white shadow-md shadow-teal-600/20">
                <Zap className="h-5 w-5 fill-current" />
              </div>
              <span className="font-display text-xl font-bold tracking-tight text-slate-900">
                Profit Navigator
              </span>
            </div>

            {/* Step 1: Identifier Input */}
            {step === 1 ? (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
              >
                {/* Title & Subtitle */}
                <div className="text-center max-w-md mx-auto mb-8">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-2">
                    {mode === "login" ? "Secure OTP Login" : "Create Your Account"}
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                    Log in using your registered email address or mobile phone number via secure OTP authentication.
                  </p>
                </div>

                {/* Mode Switcher Tabs */}
                <div className="max-w-md mx-auto bg-slate-100/80 p-1 rounded-2xl flex mb-6 border border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => { setMode("login"); }}
                    className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                      mode === "login"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Sign In with OTP
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMode("signup"); }}
                    className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                      mode === "signup"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Sign Up
                  </button>
                </div>

                {/* Form */}
                <form onSubmit={handleRequestOTP} className="space-y-4 max-w-md mx-auto">
                  {mode === "signup" && (
                    <div className="space-y-1.5">
                      <Label htmlFor="name" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Full Name <span className="text-teal-600">*</span>
                      </Label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          id="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Enter your full name"
                          className="pl-10 h-12 rounded-xl border-slate-200 focus:border-teal-500 focus:ring-teal-500 bg-slate-50/50 text-sm"
                          required
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="identifier" className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Email Address or Phone Number <span className="text-teal-600">*</span>
                      </Label>
                      {isEmail && (
                        <span className="text-[10px] bg-teal-50 text-teal-700 px-2 py-0.5 rounded-md font-semibold border border-teal-200">
                          Email Detected
                        </span>
                      )}
                      {isPhone && (
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md font-semibold border border-emerald-200">
                          Phone Detected
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      {isPhone ? (
                        <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      ) : (
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      )}
                      <Input
                        id="identifier"
                        type="text"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="owner@profitnavigator.com or +15550100001"
                        className="pl-10 h-12 rounded-xl border-slate-200 focus:border-teal-500 focus:ring-teal-500 bg-slate-50/50 text-sm"
                        required
                      />
                    </div>
                  </div>

                  {mode === "signup" && (
                    <div className="space-y-2 pt-2">
                      <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Select Account Role <span className="text-teal-600">*</span>
                      </Label>
                      <div className="grid grid-cols-1 gap-2">
                        {roleOptions.map(({ role: r, icon: Icon, blurb }) => (
                          <button
                            type="button"
                            key={r}
                            onClick={() => setRole(r)}
                            className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                              role === r
                                ? "border-teal-600 bg-teal-50/50 ring-1 ring-teal-600"
                                : "border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            <div className={`p-2 rounded-lg ${role === r ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="block text-xs font-bold text-slate-900">{roleLabels[r]}</span>
                              <span className="block text-[11px] text-slate-500 truncate">{blurb}</span>
                            </div>
                            {role === r && <Check className="h-4 w-4 text-teal-600" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-12 rounded-xl bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold text-sm shadow-lg shadow-teal-600/25 transition-all mt-4"
                    disabled={submitting}
                  >
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {mode === "login" ? "Send OTP Code" : "Create Account & Send OTP"}
                  </Button>
                </form>

                {/* Divider */}
                <div className="relative my-6 max-w-md mx-auto">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-3 text-slate-400 font-medium tracking-wider">
                      Or 1-click instant demo login
                    </span>
                  </div>
                </div>

                {/* Instant Demo Accounts Quick Click Pills */}
                <div className="grid grid-cols-3 gap-2 max-w-md mx-auto">
                  {demoAccounts.map((acc) => (
                    <button
                      key={acc.role}
                      type="button"
                      onClick={() => handleQuickDemo(acc)}
                      disabled={submitting}
                      className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-teal-50 hover:border-teal-300 text-slate-700 transition-all group shadow-xs"
                    >
                      <span className="text-xs font-bold text-slate-900 group-hover:text-teal-700 flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-teal-600" /> {acc.label}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium mt-0.5">1-Click Sign In</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              /* Step 2: Verify OTP Screen */
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className="max-w-md mx-auto"
              >
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors mb-6 font-medium"
                >
                  <ArrowLeft className="h-4 w-4" /> Change email / phone
                </button>

                <div className="text-center mb-6">
                  <div className="h-12 w-12 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center mx-auto mb-3">
                    <KeyRound className="h-6 w-6" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-2">
                    Enter Verification Code
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                    We sent a 6-digit OTP code to{" "}
                    <span className="font-semibold text-slate-900">{identifier}</span>
                  </p>
                </div>

                {/* Dev Mode Auto-Fill & Code Notice Banner */}
                {devCode && (
                  <div className="mb-6 p-3.5 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-between">
                    <div>
                      <span className="block text-[11px] uppercase tracking-wider font-bold text-teal-800">
                        🔑 Development Mode Active
                      </span>
                      <span className="text-xs text-slate-700">
                        Your OTP Code: <strong className="text-teal-900 font-mono text-sm tracking-widest">{devCode}</strong>
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setOtpCode(devCode)}
                      className="h-8 px-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-xs"
                    >
                      Auto-Fill Code
                    </Button>
                  </div>
                )}

                <form onSubmit={handleVerifyOTP} className="space-y-6">
                  <div className="flex flex-col items-center justify-center space-y-3">
                    <Label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      6-Digit Security OTP
                    </Label>
                    <InputOTP
                      maxLength={6}
                      value={otpCode}
                      onChange={(val) => setOtpCode(val)}
                    >
                      <InputOTPGroup className="gap-2">
                        <InputOTPSlot index={0} className="h-12 w-12 rounded-xl text-lg font-bold border-slate-300 focus:ring-teal-500" />
                        <InputOTPSlot index={1} className="h-12 w-12 rounded-xl text-lg font-bold border-slate-300 focus:ring-teal-500" />
                        <InputOTPSlot index={2} className="h-12 w-12 rounded-xl text-lg font-bold border-slate-300 focus:ring-teal-500" />
                        <InputOTPSlot index={3} className="h-12 w-12 rounded-xl text-lg font-bold border-slate-300 focus:ring-teal-500" />
                        <InputOTPSlot index={4} className="h-12 w-12 rounded-xl text-lg font-bold border-slate-300 focus:ring-teal-500" />
                        <InputOTPSlot index={5} className="h-12 w-12 rounded-xl text-lg font-bold border-slate-300 focus:ring-teal-500" />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {/* Expiration Timer Indicator */}
                  <div className="flex items-center justify-between text-xs px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                      <Clock className="h-4 w-4 text-teal-600" />
                      {expiresIn > 0 ? (
                        <>OTP expires in <span className="font-bold text-slate-900">{formatTimer(expiresIn)}</span></>
                      ) : (
                        <span className="text-rose-600 font-bold">OTP has expired.</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={cooldown > 0 || submitting}
                      className={`flex items-center gap-1 text-xs font-bold transition-all ${
                        cooldown > 0 || submitting
                          ? "text-slate-400 cursor-not-allowed"
                          : "text-teal-700 hover:text-teal-800 underline"
                      }`}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${submitting ? "animate-spin" : ""}`} />
                      {cooldown > 0 ? `Resend (${cooldown}s)` : "Resend OTP"}
                    </button>
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 rounded-xl bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold text-sm shadow-lg shadow-teal-600/25 transition-all"
                    disabled={submitting || otpCode.length !== 6 || expiresIn <= 0}
                  >
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Verify OTP & Log In
                  </Button>
                </form>

                {/* Helper notice */}
                <p className="text-[11px] text-center text-slate-400 mt-6 leading-relaxed">
                  Never share your 6-digit OTP code with anyone. To configure real SMTP or Twilio SMS delivery, add credentials to your <code className="text-slate-600 font-mono">.env</code> file.
                </p>
              </motion.div>
            )}
          </div>

          {/* Footer Copyright */}
          <div className="mt-8 text-center text-xs text-slate-400 max-w-md mx-auto pt-4 border-t border-slate-100">
            <p className="space-x-2">
              <span>Copyright © Profit Navigator. All Rights Reserved</span>
              <span>•</span>
              <a href="#" className="hover:text-teal-600 transition-colors">Term & Condition</a>
              <span>|</span>
              <a href="#" className="hover:text-teal-600 transition-colors">Privacy & Policy</a>
            </p>
          </div>
        </div>

        {/* RIGHT COLUMN — SHOWCASE BANNER */}
        <div className="flex-1 bg-gradient-to-br from-[#042f2e] via-[#064e3b] to-[#0f172a] p-8 lg:p-12 text-white flex flex-col justify-between relative overflow-hidden">
          
          {/* Subtle Grid Overlay Pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:32px_32px]" />

          {/* Glowing background spotlights */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-teal-500/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl" />

          {/* Floating Glassmorphism Cards Showcase */}
          <div className="relative z-10 space-y-4 my-auto py-6 max-w-lg mx-auto w-full">
            
            {/* Top Floating Card — Security Shield Widget */}
            <motion.div
              className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-4 shadow-2xl max-w-xs ml-auto translate-x-4 hover:translate-x-2 transition-all duration-300"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center justify-between text-xs text-white/70 mb-2">
                <span className="font-semibold text-white flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" /> OTP Protection
                </span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-md font-bold">Encrypted</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full border-2 border-teal-400 bg-teal-500/20 flex items-center justify-center font-bold text-xs text-teal-200">
                  2FA
                </div>
                <div>
                  <p className="text-sm font-bold text-white">SHA-256 Hashing</p>
                  <p className="text-[10px] text-emerald-300 font-medium">Rate-limited 5-min expiry</p>
                </div>
              </div>
            </motion.div>

            {/* Middle Main Floating Card — Capital Allocations */}
            <motion.div
              className="bg-white/15 backdrop-blur-2xl border border-white/30 rounded-2xl p-5 shadow-2xl max-w-sm mx-auto z-20"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white">Capital Allocations</span>
                <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/20 px-2 py-0.5 rounded-full">
                  ▲ +12%
                </span>
              </div>
              <p className="text-2xl font-black tracking-tight text-white mb-3">$17,366.00</p>
              
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center bg-white/10 p-2 rounded-xl">
                  <span>iPhone 15 Pro Max <span className="text-[10px] text-white/60 block">40 units sold</span></span>
                  <span className="font-bold text-teal-300">$1,100 <span className="text-[10px] text-emerald-400 block">+3.8%</span></span>
                </div>
                <div className="flex justify-between items-center bg-white/10 p-2 rounded-xl">
                  <span>Gree Air Conditioner <span className="text-[10px] text-white/60 block">25 units sold</span></span>
                  <span className="font-bold text-teal-300">$700 <span className="text-[10px] text-emerald-400 block">+2.5%</span></span>
                </div>
              </div>
            </motion.div>

            {/* Bottom Floating Card — Future Funds */}
            <motion.div
              className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl p-4 shadow-2xl max-w-xs -translate-x-4 hover:translate-x-0 transition-all duration-300"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <div className="flex items-center justify-between text-xs text-white/70 mb-1">
                <span className="font-semibold text-white">Monthly Profit Goal</span>
                <span className="text-[10px] text-teal-300 font-bold">70% Target</span>
              </div>
              <div className="flex justify-between items-baseline mb-2">
                <p className="text-base font-bold text-white">$14,000 <span className="text-xs font-normal text-white/60">/ $20,000</span></p>
              </div>
              <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-teal-400 to-emerald-300 h-full w-[70%]" />
              </div>
            </motion.div>

          </div>

          {/* Central Logo Badge & Typography */}
          <div className="relative z-10 text-center max-w-md mx-auto mt-6">
            <div className="h-16 w-16 rounded-2xl bg-teal-500/20 border border-teal-400/30 backdrop-blur-md flex items-center justify-center mx-auto mb-4 text-teal-300 shadow-xl shadow-teal-500/20">
              <Zap className="h-8 w-8 fill-current" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2 leading-snug">
              A Unified Hub for Smarter Financial Decision-Making
            </h2>
            <p className="text-xs sm:text-sm text-teal-100/75 leading-relaxed font-normal">
              Profit Navigator empowers you with a unified financial command center—delivering deep insights and a 360° view of your entire business world.
            </p>
          </div>

          {/* Bottom Progress Line Indicators */}
          <div className="relative z-10 flex justify-center gap-2 mt-8">
            <div className="h-1 w-12 rounded-full bg-teal-400" />
            <div className="h-1 w-12 rounded-full bg-white/20" />
            <div className="h-1 w-12 rounded-full bg-white/20" />
            <div className="h-1 w-12 rounded-full bg-white/20" />
          </div>

        </div>

      </div>
    </div>
  );
}
