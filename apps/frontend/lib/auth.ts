import type { LoginResponse, AuthUser } from "@knowledge-hub/shared-types";

// Frontend-specific auth utility
class AuthUtil {
  private tokenKey = "authToken";
  private userKey = "authUser";
  private apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${this.apiUrl}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });

    if (!response.ok) {
      let errorMessage = "Login failed";
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch {
        // If JSON parsing fails, use default message
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();

    // Store auth data
    if (typeof window !== "undefined") {
      const token = data.access_token || data.accessToken;
      if (token) {
        localStorage.setItem(this.tokenKey, token);
      }
      if (data.user) {
        localStorage.setItem(this.userKey, JSON.stringify(data.user));
      }
    }

    return data;
  }

  async logout(): Promise<void> {
    try {
      await fetch(`${this.apiUrl}/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
        },
      });
    } catch (error) {
      console.warn("Server logout failed:", error);
    }

    this.clearAuthData();
  }

  getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(this.tokenKey);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getUser(): AuthUser | null {
    if (typeof window === "undefined") return null;
    const userStr = localStorage.getItem(this.userKey);
    return userStr ? JSON.parse(userStr) : null;
  }

  getAuthHeaders(): Record<string, string> {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  private clearAuthData(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }
}

export const authUtil = new AuthUtil();
