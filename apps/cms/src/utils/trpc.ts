import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@knowledge-hub/shared-types";

export const trpc = createTRPCReact<AppRouter>();

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: import.meta.env.VITE_API_URL
        ? `${import.meta.env.VITE_API_URL}/trpc`
        : "http://localhost:3001/api/trpc",
      headers() {
        return {
          // Add any headers you need here
        };
      },
    }),
  ],
});
