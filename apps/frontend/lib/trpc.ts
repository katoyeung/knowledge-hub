import { createTRPCNext } from "@trpc/next";
import { httpBatchLink } from "@trpc/client";
// import type { AppRouter } from "@knowledge-hub/shared-types";

function getBaseUrl() {
  if (typeof window !== "undefined")
    // browser should use relative path
    return "";
  if (process.env.VERCEL_URL)
    // reference for vercel.com
    return `https://${process.env.VERCEL_URL}`;
  if (process.env.RENDER_INTERNAL_HOSTNAME)
    // reference for render.com
    return `http://${process.env.RENDER_INTERNAL_HOSTNAME}:${process.env.PORT}`;
  // assume localhost
  return `http://localhost:${process.env.PORT ?? 3001}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const trpc = createTRPCNext<any>({
  config(opts) {
    const { ctx } = opts;
    if (typeof window !== "undefined") {
      // during client requests
      return {
        links: [
          httpBatchLink({
            url: "/api/trpc",
          }),
        ],
      };
    }
    return {
      links: [
        httpBatchLink({
          // The server needs to know your app's full url
          url: `${getBaseUrl()}/api/trpc`,
          /**
           * Set custom request headers on every request from tRPC
           * @link https://trpc.io/docs/v10/header
           */
          headers() {
            if (!ctx?.req?.headers) {
              return {};
            }
            // To use SSR properly, you need to forward the client's headers to the server
            // This is so you can pass through things like cookies when we're server-side rendering
            return {
              cookie: ctx.req.headers.cookie,
            };
          },
        }),
      ],
    };
  },
  /**
   * @link https://trpc.io/docs/v10/ssr
   **/
  ssr: false,
});
