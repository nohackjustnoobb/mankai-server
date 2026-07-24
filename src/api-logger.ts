import { createMiddleware } from "@tanstack/react-start";

const color = {
  reset: "\x1b[0m",
  gray: "\x1b[90m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function statusColor(status: number) {
  if (status >= 500) return color.red;
  if (status >= 400) return color.yellow;
  if (status >= 300) return color.cyan;
  return color.green;
}

export const apiRequestLoggerMiddleware = createMiddleware().server(
  async ({ request, pathname, next }) => {
    if (!isApiPath(pathname)) {
      return next();
    }

    const startedAt = performance.now();
    let status = 500;

    try {
      const result = await next();
      status = result.response.status;
      return result;
    } catch (error) {
      if (error instanceof Response) {
        status = error.status;
      }
      throw error;
    } finally {
      const durationMs = Math.round(performance.now() - startedAt);
      console.info(
        `${color.gray}[API]${color.reset} ` +
          `${color.cyan}${request.method}${color.reset} ` +
          `${pathname} ` +
          `${statusColor(status)}${status}${color.reset} ` +
          `${color.gray}${durationMs}ms${color.reset}`,
      );
    }
  },
);
