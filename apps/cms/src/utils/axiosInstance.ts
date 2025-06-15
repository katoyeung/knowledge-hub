import axios, { AxiosError } from "axios";
import { TOKEN_KEY } from "../authProvider";
import { HttpError } from "@refinedev/core";
import { apiUrl } from "../appConfig";

const axiosInstance = axios.create({
  baseURL: apiUrl,
});

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.clear();
      window.location.href = "/login";
    }

    const customError: HttpError = {
      ...error,
      message:
        (error.response?.data as { message?: string })?.message ||
        error.message,
      statusCode: error.response?.status as number,
    };

    return Promise.reject(customError);
  }
);

export default axiosInstance;
