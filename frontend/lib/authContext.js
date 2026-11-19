"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, setToken, clearToken } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    api("/auth/me")
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // After an officer resets a password, the account can do nothing except change it.
  useEffect(() => {
    if (user?.mustChangePassword && pathname !== "/change-password") router.replace("/change-password");
  }, [user, pathname, router]);

  async function login(loginId, password) {
    const data = await api("/auth/login", { method: "POST", body: { loginId, password }, auth: false });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  async function register(loginId, password, role, inviteCode) {
    await api("/auth/register", { method: "POST", body: { loginId, password, role, inviteCode }, auth: false });
    return login(loginId, password);
  }

  async function changePassword(currentPassword, newPassword) {
    const data = await api("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
    setToken(data.token); // all older sessions are now invalid; keep using the fresh token
    setUser(data.user);
    return data.user;
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, changePassword, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
