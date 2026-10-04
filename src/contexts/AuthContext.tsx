/**
 * Authentication state — the single source of truth for "who is logged in"
 * and therefore for the active role (owner / manager / analyst). The token is
 * persisted via the api client (localStorage), and the cached user is restored
 * on load then re-validated against the backend (/api/auth/me).
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  type AuthUser,
  type OTPRequestResponse,
  fetchCurrentUser,
  getAuthToken,
  loginUser,
  logoutUser,
  registerUser,
  requestOTP,
  resendOTP,
  setAuthToken,
  updateProfile,
  verifyOTP,
} from "@/lib/api";

const USER_KEY = "auth_user";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  sendOTP: (identifier: string) => Promise<OTPRequestResponse>;
  verifyOTPCode: (identifier: string, otp: string) => Promise<AuthUser>;
  resendOTPCode: (identifier: string) => Promise<OTPRequestResponse>;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (data: {
    name: string;
    email: string;
    phone?: string;
    password?: string;
    role: AuthUser["role"];
  }) => Promise<AuthUser>;
  updateUser: (data: {
    name?: string;
    phone?: string;
    avatarUrl?: string | null;
    currentPassword?: string;
    newPassword?: string;
  }) => Promise<AuthUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function cacheUser(user: AuthUser | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readCachedUser());
  const [loading, setLoading] = useState(true);

  // Revalidate the cached session against the backend on startup.
  useEffect(() => {
    let cancelled = false;
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetchCurrentUser()
      .then((fresh) => {
        if (cancelled) return;
        setUser(fresh);
        cacheUser(fresh);
      })
      .catch(() => {
        if (cancelled) return;
        // Token invalid/expired — clear the session.
        setAuthToken(null);
        cacheUser(null);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sendOTP = async (identifier: string) => {
    return requestOTP(identifier);
  };

  const verifyOTPCode = async (identifier: string, otp: string) => {
    const { token, user: u } = await verifyOTP(identifier, otp);
    setAuthToken(token);
    cacheUser(u);
    setUser(u);
    return u;
  };

  const resendOTPCode = async (identifier: string) => {
    return resendOTP(identifier);
  };

  const login = async (email: string, password: string) => {
    const { token, user: u } = await loginUser(email, password);
    setAuthToken(token);
    cacheUser(u);
    setUser(u);
    return u;
  };

  const register = async (data: {
    name: string;
    email: string;
    phone?: string;
    password?: string;
    role: AuthUser["role"];
  }) => {
    const { token, user: u } = await registerUser(data);
    setAuthToken(token);
    cacheUser(u);
    setUser(u);
    return u;
  };

  const updateUser = async (data: {
    name?: string;
    phone?: string;
    avatarUrl?: string | null;
    currentPassword?: string;
    newPassword?: string;
  }) => {
    const updated = await updateProfile(data);
    cacheUser(updated);
    setUser(updated);
    return updated;
  };

  const logout = async () => {
    try {
      await logoutUser();
    } catch {
      // Ignored if network fails during logout
    }
    setAuthToken(null);
    cacheUser(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        sendOTP,
        verifyOTPCode,
        resendOTPCode,
        login,
        register,
        updateUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
