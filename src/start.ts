import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start";

import { apiLogger } from "#/lib/logger.server.ts";

const csrfMiddleware = createCsrfMiddleware({
  filter: ({ handlerType }) => handlerType === "serverFn",
});

const apiRequestLoggerMiddleware = createMiddleware().server(
  async ({ request, pathname, next }) => {
    if (pathname !== "/api" && !pathname.startsWith("/api/")) {
      return next();
    }

    const startedAt = performance.now();
    let status = 500;
    let requestError: unknown;

    try {
      const result = await next();
      status = result.response.status;
      return result;
    } catch (error) {
      if (error instanceof Response) {
        status = error.status;
      }
      requestError = error;
      throw error;
    } finally {
      const durationMs = Math.round(performance.now() - startedAt);
      const details = {
        method: request.method,
        path: pathname,
        status,
        durationMs,
      };

      if (status >= 500) {
        apiLogger.error(
          requestError instanceof Error
            ? { ...details, err: requestError }
            : details,
          "API request completed",
        );
      } else if (status >= 400) {
        apiLogger.warn(details, "API request completed");
      } else {
        apiLogger.info(details, "API request completed");
      }
    }
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, apiRequestLoggerMiddleware],
}));
