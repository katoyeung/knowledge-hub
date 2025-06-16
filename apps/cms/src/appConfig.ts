// CMS App Configuration
export const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";
export const apiBaseUrl = apiUrl.replace(/\/$/, ""); // Remove trailing slash

// App Configuration
export const appConfig = {
  name: "Knowledge Hub CMS",
  description: "Content Management System for Knowledge Hub",
  version: "1.0.0",
  api: {
    baseUrl: apiBaseUrl,
    endpoints: {
      auth: {
        login: `${apiBaseUrl}/auth/login`,
        logout: `${apiBaseUrl}/auth/logout`,
        me: `${apiBaseUrl}/auth/me`,
        refresh: `${apiBaseUrl}/auth/refresh`,
      },
      users: `${apiBaseUrl}/users`,
      posts: `${apiBaseUrl}/posts`,

      prompts: `${apiBaseUrl}/prompts`,
      datasets: `${apiBaseUrl}/datasets`,
      logger: `${apiBaseUrl}/logger`,
    },
  },
  features: {
    enableWorkflows: false,
    enablePosts: true,
    enablePrompts: true,
    enableDatasets: true,
    enableLogger: true,
  },
};

// For backward compatibility
export { apiUrl as default };
