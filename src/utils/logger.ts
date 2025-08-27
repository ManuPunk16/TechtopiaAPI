import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Crear directorio de logs si no existe
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configuración del logger
const logLevel = process.env.LOG_LEVEL || 'info';
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Formato personalizado para desarrollo
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    // Agregar stack trace si existe
    if (stack) {
      log += `\n${stack}`;
    }
    
    // Agregar metadata si existe
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
    }
    
    return log;
  })
);

// Formato para producción
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Crear logger
const logger = winston.createLogger({
  level: logLevel,
  format: isDevelopment ? developmentFormat : productionFormat,
  defaultMeta: {
    service: 'techtopia-api',
    version: process.env.API_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Consola (siempre habilitada)
    new winston.transports.Console({
      format: isDevelopment ? developmentFormat : productionFormat,
      level: isDevelopment ? 'debug' : 'info'
    })
  ],
  // Manejar excepciones no capturadas
  exceptionHandlers: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ],
  // Manejar rechazos de promesas no capturadas
  rejectionHandlers: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// En producción, agregar archivos de log
if (isProduction) {
  // Log de errores
  logger.add(new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: productionFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
    tailable: true
  }));

  // Log combinado
  logger.add(new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    format: productionFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 10,
    tailable: true
  }));

  // Log de acceso (para requests HTTP)
  logger.add(new winston.transports.File({
    filename: path.join(logsDir, 'access.log'),
    level: 'http',
    format: productionFormat,
    maxsize: 10485760, // 10MB
    maxFiles: 5,
    tailable: true
  }));
}

// Métodos de utilidad adicionales
const loggerUtils = {
  // Log de request HTTP
  logRequest: (req: any, res: any, responseTime: number) => {
    logger.http('HTTP Request', {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      contentLength: res.get('content-length') || 0,
      timestamp: new Date().toISOString()
    });
  },

  // Log de error con contexto
  logError: (error: Error, context: string, additionalInfo: any = {}) => {
    logger.error(`Error in ${context}`, {
      name: error.name,
      message: error.message,
      stack: error.stack,
      context,
      ...additionalInfo,
      timestamp: new Date().toISOString()
    });
  },

  // Log de performance
  logPerformance: (operation: string, duration: number, metadata: any = {}) => {
    const level = duration > 1000 ? 'warn' : 'info';
    logger.log(level, `Performance: ${operation}`, {
      operation,
      duration: `${duration}ms`,
      ...metadata,
      timestamp: new Date().toISOString()
    });
  },

  // Log de base de datos
  logDatabase: (operation: string, collection: string, duration?: number, metadata: any = {}) => {
    logger.info(`Database: ${operation}`, {
      operation,
      collection,
      duration: duration ? `${duration}ms` : undefined,
      ...metadata,
      timestamp: new Date().toISOString()
    });
  }
};

// Exportar logger y utilidades
export { logger, loggerUtils };
export default logger;

// Log inicial
if (isDevelopment) {
  logger.info('🚀 Logger initialized for development environment');
} else {
  logger.info('Logger initialized', {
    environment: process.env.NODE_ENV,
    logLevel: logLevel,
    logsDirectory: logsDir
  });
}