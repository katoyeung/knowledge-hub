import type { AuthProvider } from "@refinedev/core";
import type { LoginResponse, AuthUser } from "@knowledge-hub/shared-types";
import axios from "axios";
import { appConfig } from "./appConfig";
import axiosInstance from "./utils/axiosInstance";

export const TOKEN_KEY = "authToken";
export const TOKEN_EXPIRATION_KEY = "tokenExpiration";
export const USER_KEY = "authUser";

export const authProvider: AuthProvider = {
  login: async ({ email, password, remember }) => {
    if (email && password) {
      try {
        const response = await axios.post(appConfig.api.endpoints.auth.login, {
          email,
          password,
          remember,
        });

        const {
          access_token: accessToken,
          expires_in: expiresIn,
          user,
        } = response.data as LoginResponse;

        const expirationTime = new Date().getTime() + expiresIn * 1000;

        localStorage.setItem(TOKEN_KEY, accessToken);
        localStorage.setItem(TOKEN_EXPIRATION_KEY, expirationTime.toString());
        localStorage.setItem(USER_KEY, JSON.stringify(user));

        axiosInstance.defaults.headers.common[
          "Authorization"
        ] = `Bearer ${accessToken}`;

        return {
          success: true,
          redirectTo: "/",
        };
      } catch (error) {
        return {
          success: false,
          error: {
            name: "LoginError",
            message:
              (error as { response?: { data?: { message?: string } } })
                ?.response?.data?.message || "Invalid username or password",
          },
        };
      }
    }

    return {
      success: false,
      error: {
        name: "LoginError",
        message: "Email and password are required",
      },
    };
  },
  logout: async () => {
    localStorage.clear();
    return {
      success: true,
      redirectTo: "/login",
    };
  },
  check: async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const expirationTime = localStorage.getItem(TOKEN_EXPIRATION_KEY);

    if (token && expirationTime) {
      const currentTime = new Date().getTime();
      if (currentTime < parseInt(expirationTime, 10)) {
        return {
          authenticated: true,
        };
      } else {
        localStorage.clear();

        return {
          authenticated: false,
          redirectTo: "/login",
          error: {
            name: "SessionExpiredError",
            message: "Session has expired. Please log in again.",
          },
        };
      }
    }

    return {
      authenticated: false,
      redirectTo: "/login",
    };
  },
  getPermissions: async () => {
    const user = localStorage.getItem(USER_KEY);
    if (user) {
      const { roles } = JSON.parse(user);
      return roles;
    }

    return null;
  },
  getIdentity: async () => {
    const user = localStorage.getItem(USER_KEY);
    if (user) {
      const { id, email, roles } = JSON.parse(user);
      return { id, email, roles };
    }

    return null;
  },
  onError: async (error) => {
    if (
      error.response &&
      (error.response.status === 401 || error.response.status === 403)
    ) {
      localStorage.clear();

      return {
        logout: true,
        redirectTo: "/login",
        error,
      };
    }
    return { error };
  },
  register: async ({ email, password }) => {
    try {
      const response = await axios.post(
        `${appConfig.api.baseUrl}/auth/register`,
        {
          email,
          password,
        }
      );
      if (response.status === 200 && response.data.success) {
        return {
          success: true,
          redirectTo: "/login",
          successNotification: {
            message: "Registration Successful",
            description: "You have successfully registered.",
          },
        };
      }
      return Promise.resolve(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          success: false,
          error: {
            name: "Register Error",
            message:
              error.response?.data?.error?.message ||
              error.message ||
              "Registration failed",
          },
        };
      }
      return Promise.reject("Registration failed");
    }
  },
};
