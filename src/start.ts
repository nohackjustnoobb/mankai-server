import {
  createCsrfMiddleware,
  createStart,
} from "@tanstack/react-start";

import { apiRequestLoggerMiddleware } from "#/api-logger.ts";

const csrfMiddleware = createCsrfMiddleware({
  filter: ({ handlerType }) => handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, apiRequestLoggerMiddleware],
}));
