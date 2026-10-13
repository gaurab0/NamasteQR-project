import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Business, SignupFormData, LoginFormData, VerifyOtpFormData } from '../types/auth';
import { authApi } from '../api/authApi';
import { rbacService } from '../services/rbac.service';

interface PendingVerificationData {
  email: string;
  phoneE164: string;
  businessName?: string;
  devOtp?: string;
}

interface AuthContextType {
  user: User | null;
  activeBusiness: Business | null;
  currentBusiness: Business | null;
  branches: Business[];
  isLoadingBranches: boolean;
  activeBranchId: string | null;
  switchBranch: (branchId: string) => void;
  refreshBranches: () => Promise<Business[]>;
  createBranch: (data: {
    name: string;
    branch_code?: string;
    location?: string;
    phone?: string;
    tagline?: string;
    kitchen_hours?: string;
    currency?: string;
    tax_rate?: number;
    business_type?: string;
    clone_menu_from?: string;
  }) => Promise<{ branch: Business; cloneStats?: { categoriesCloned: number; itemsCloned: number } }>;
  isLoading: boolean;
  isAuthenticated: boolean;
  pendingVerification: PendingVerificationData | null;
  setPendingVerification: (data: PendingVerificationData | null) => void;
  login: (data: LoginFormData) => Promise<{ success: boolean; verificationRequired?: boolean }>;
  signup: (data: SignupFormData) => Promise<{ success: boolean; verificationRequired: boolean; devOtp?: string }>;
  verifyEmail: (data: VerifyOtpFormData) => Promise<{ success: boolean }>;
  resendOtp: (emailOrPhone?: { email?: string; phone_e164?: string }) => Promise<{ success: boolean; devOtp?: string; cooldownSeconds?: number }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateBusiness: (updated: Partial<Business>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const cached = localStorage.getItem('serveflow_cached_user');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [branches, setBranches] = useState<Business[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState<boolean>(false);
  const [activeBranchId, setActiveBranchId] = useState<string | null>(() => {
    return localStorage.getItem('serveflow_active_branch_id') || null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    const token = localStorage.getItem('serveflow_auth_token') || sessionStorage.getItem('serveflow_auth_token');
    const cached = localStorage.getItem('serveflow_cached_user');
    if (!token && !cached) return false;
    return true;
  });

  const [pendingVerification, setPendingVerification] = useState<PendingVerificationData | null>(() => {
    const saved = sessionStorage.getItem('serveflow_pending_verify');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('serveflow_cached_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('serveflow_cached_user');
    }
  }, [user]);

  useEffect(() => {
    if (pendingVerification) {
      sessionStorage.setItem('serveflow_pending_verify', JSON.stringify(pendingVerification));
    } else {
      sessionStorage.removeItem('serveflow_pending_verify');
    }
  }, [pendingVerification]);

  // Load branches when user is logged in
  const refreshBranches = useCallback(async (): Promise<Business[]> => {
    if (!user) return [];
    setIsLoadingBranches(true);
    try {
      const list = await rbacService.getBranchesApi(user.business?.id);
      if (Array.isArray(list)) {
        setBranches(list);

        // Check if current activeBranchId exists in list
        const savedBranchId = localStorage.getItem('serveflow_active_branch_id');
        const matched = list.find((b) => b.id === savedBranchId);
        if (matched) {
          // Sync user.business with the saved active branch if needed
          setUser((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              business: {
                ...prev.business,
                ...matched,
              },
            };
          });
        } else if (list.length > 0 && !savedBranchId) {
          localStorage.setItem('serveflow_active_branch_id', list[0].id);
          setActiveBranchId(list[0].id);
        }
        return list;
      }
      return [];
    } catch (e: any) {
      console.warn('refreshBranches notice:', e.message);
      return [];
    } finally {
      setIsLoadingBranches(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      refreshBranches();
    } else {
      setBranches([]);
    }
  }, [user?.id, refreshBranches]);

  const switchBranch = useCallback((branchId: string) => {
    setActiveBranchId(branchId);
    localStorage.setItem('serveflow_active_branch_id', branchId);

    // Find the branch from the branches list
    const found = branches.find((b) => b.id === branchId);
    if (found) {
      setUser((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          business: {
            ...prev.business,
            ...found,
          },
        };
      });
    }
  }, [branches]);

  const createBranch = async (data: {
    name: string;
    branch_code?: string;
    location?: string;
    phone?: string;
    tagline?: string;
    kitchen_hours?: string;
    currency?: string;
    tax_rate?: number;
    business_type?: string;
    clone_menu_from?: string;
  }) => {
    const res = await rbacService.createBranchApi(data);
    await refreshBranches();
    return res;
  };

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('serveflow_auth_token') || sessionStorage.getItem('serveflow_auth_token');
    try {
      const res = await authApi.getMe();
      if (res.success && res.data?.user) {
        const freshUser = res.data.user;
        const savedBranchId = localStorage.getItem('serveflow_active_branch_id');
        
        // If there's an active branch stored that differs from the main, keep it intact
        setUser(freshUser);
      } else if (!token) {
        setUser(null);
      }
    } catch {
      if (!token) {
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const signup = async (data: SignupFormData) => {
    const res = await authApi.signup(data);
    if (res.success && res.verificationRequired) {
      // Clear any prior cached session when initiating new registration
      localStorage.removeItem('serveflow_auth_token');
      localStorage.removeItem('serveflow_cached_user');
      setUser(null);
      const phoneE164 = `${data.countryCode}${data.phoneNumber}`;
      setPendingVerification({
        email: data.email,
        phoneE164,
        businessName: data.businessName,
        devOtp: res.data?.devOtp,
      });
    }
    return {
      success: true,
      verificationRequired: !!res.verificationRequired,
      devOtp: res.data?.devOtp,
    };
  };

  const verifyEmail = async (data: VerifyOtpFormData) => {
    const res = await authApi.verifyEmail(data);
    // Verified successfully - clear pending verification, but DO NOT auto-login
    setPendingVerification(null);
    localStorage.removeItem('serveflow_auth_token');
    localStorage.removeItem('serveflow_cached_user');
    setUser(null);
    return { success: true, email: data.email || res.data?.email };
  };

  const resendOtp = async (emailOrPhone?: { email?: string; phone_e164?: string }) => {
    const payload = emailOrPhone || {
      email: pendingVerification?.email,
      phone_e164: pendingVerification?.phoneE164,
    };
    const res = await authApi.resendOtp(payload);
    if (res.success && res.data?.devOtp && pendingVerification) {
      setPendingVerification({
        ...pendingVerification,
        devOtp: res.data.devOtp,
      });
    }
    return {
      success: true,
      devOtp: res.data?.devOtp,
      cooldownSeconds: res.data?.cooldownSeconds,
    };
  };

  const login = async (data: LoginFormData) => {
    try {
      const res = await authApi.login(data);
      if (res.success && res.data?.user) {
        if (res.data.token) {
          localStorage.setItem('serveflow_auth_token', res.data.token);
        }
        setUser(res.data.user);
        setPendingVerification(null);
        return { success: true };
      }
      return { success: false };
    } catch (err: any) {
      if (err.code === 'ACCOUNT_NOT_VERIFIED') {
        setPendingVerification({
          email: data.email,
          phoneE164: err.data?.phoneE164 || '',
        });
        return { success: false, verificationRequired: true };
      }
      throw err;
    }
  };

  const logout = async () => {
    try {
      if (user) {
        await authApi.logout({
          userId: user.id,
          businessId: user.business?.id,
          email: user.email,
          accountName: user.business?.name || user.email,
        });
      } else {
        await authApi.logout();
      }
    } finally {
      localStorage.removeItem('serveflow_auth_token');
      localStorage.removeItem('serveflow_cached_user');
      localStorage.removeItem('serveflow_active_branch_id');
      sessionStorage.removeItem('serveflow_auth_token');
      sessionStorage.removeItem('serveflow_staff_role_session');
      setUser(null);
      setBranches([]);
      setActiveBranchId(null);
      setPendingVerification(null);
    }
  };

  const updateBusiness = (updated: Partial<Business>) => {
    setUser((prev) => {
      if (!prev) return null;
      const mergedBusiness = {
        ...prev.business,
        ...updated,
      };
      return {
        ...prev,
        business: mergedBusiness,
      };
    });

    setBranches((prev) =>
      prev.map((b) => {
        if (b.id === user?.business?.id) {
          return { ...b, ...updated };
        }
        return b;
      })
    );
  };

  const activeBusiness = user?.business || (branches.length > 0 ? branches[0] : null);

  return (
    <AuthContext.Provider
      value={{
        user,
        activeBusiness,
        currentBusiness: activeBusiness,
        branches,
        isLoadingBranches,
        activeBranchId: activeBranchId || activeBusiness?.id || null,
        switchBranch,
        refreshBranches,
        createBranch,
        isLoading,
        isAuthenticated: !!user,
        pendingVerification,
        setPendingVerification,
        login,
        signup,
        verifyEmail,
        resendOtp,
        logout,
        refreshUser,
        updateBusiness,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
