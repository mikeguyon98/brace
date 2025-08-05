import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
      const serviceName = service || 'unknown';
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
      return `${timestamp} [${serviceName}] ${level}: ${message} ${metaStr}`;
    })
  ),
  defaultMeta: { service: process.env.SERVICE_NAME || 'billing-simulator' },
  transports: [
    new winston.transports.Console({
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
});

export const createServiceLogger = (serviceName: string) => {
  return logger.child({ service: serviceName });
};