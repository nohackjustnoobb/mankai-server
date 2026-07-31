import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  base: { service: "mankai-server" },
  level: process.env.LOG_LEVEL?.trim() || (isProduction ? "info" : "debug"),
  redact: {
    paths: [
      "authorization",
      "password",
      "apiKey",
      "token",
      "headers.authorization",
      "request.headers.authorization",
      "req.headers.authorization",
    ],
    censor: "[Redacted]",
  },
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname,service",
          translateTime: "SYS:standard",
        },
      },
});

export const apiLogger = logger.child({ name: "api" });
export const trackerLogger = logger.child({ name: "tracker" });
