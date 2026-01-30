import pino from "pino";
import HyperExpress from "hyper-express";

const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "yyyy-mm-dd HH:MM:ss",
      ignore: "pid,hostname",
    },
  },
});

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

const getClientIP = (request: HyperExpress.Request): string => {
  return (
    request.headers["x-forwarded-for"]?.split(",")[0] ||
    request.headers["x-real-ip"] ||
    request.ip ||
    "Unknown"
  );
};

const logRequest: HyperExpress.MiddlewareHandler = (
  request,
  response,
  next,
) => {
  const start = process.hrtime.bigint();
  const clientIP = getClientIP(request);

  response.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    const status = response.statusCode || 200;

    const methodColor = colors.cyan;
    const urlColor = colors.blue;
    const statusColor =
      status >= 400 ? colors.red : status >= 300 ? colors.yellow : colors.green;
    const ipColor = colors.magenta;
    const timeColor = colors.gray;

    const coloredMessage =
      `${methodColor}${request.method}${colors.reset} ` +
      `${urlColor}${request.url}${colors.reset} ` +
      `${statusColor}${status}${colors.reset} ` +
      `${ipColor}${clientIP}${colors.reset} ` +
      `${timeColor}${durationMs.toFixed(2)}ms${colors.reset}`;

    logger.info(coloredMessage);
  });
  next();
};

export { logger, colors, logRequest };
