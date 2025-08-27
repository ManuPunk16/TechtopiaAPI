import mongoose from 'mongoose';

// Logger simple interno para evitar dependencias circulares
const dbLogger = {
  info: (message: string, data?: any) => {
    console.log(`[DB-INFO] ${new Date().toISOString()} - ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (message: string, error?: any) => {
    console.error(`[DB-ERROR] ${new Date().toISOString()} - ${message}`, error instanceof Error ? error.message : error);
  },
  warn: (message: string, data?: any) => {
    console.warn(`[DB-WARN] ${new Date().toISOString()} - ${message}`, data || '');
  }
};

interface MongoConfig {
  uri: string;
  options: mongoose.ConnectOptions;
}

class DatabaseConnection {
  private static instance: DatabaseConnection;
  private isConnected = false;
  private connectionPromise: Promise<typeof mongoose> | null = null;

  private constructor() {}

  static getInstance(): DatabaseConnection {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  private getConfig(): MongoConfig {
    const uri = process.env.MONGODB_URI;
    
    if (!uri) {
      throw new Error('❌ MONGODB_URI environment variable is required');
    }

    // Validar que tiene el formato correcto
    if (!uri.startsWith('mongodb+srv://') && !uri.startsWith('mongodb://')) {
      throw new Error('❌ MONGODB_URI must be a valid MongoDB connection string');
    }

    return {
      uri,
      options: {
        // ⚡ Optimizaciones para Vercel Serverless (2024)
        maxPoolSize: 5, // Reducido para serverless
        minPoolSize: 1, // Mantener al menos 1 conexión
        maxIdleTimeMS: 30000, // Cerrar conexiones inactivas después de 30s
        serverSelectionTimeoutMS: 10000, // 10s timeout para seleccionar servidor
        socketTimeoutMS: 45000, // 45s timeout para operaciones socket
        heartbeatFrequencyMS: 10000, // Heartbeat cada 10s
        
        // 🔒 Configuraciones de seguridad
        retryWrites: true,
        w: 'majority',
        
        // 🚀 Configuraciones de rendimiento modernas
        compressors: ['zstd', 'snappy', 'zlib'], // Compresión moderna
        zlibCompressionLevel: 6,
        
        // 📡 Configuraciones de red
        family: 4, // IPv4 solamente
        bufferCommands: false, // Deshabilitar command buffering
        
        // 🔄 Configuraciones de reconexión modernas
        connectTimeoutMS: 30000,
        maxConnecting: 2, // Máximo 2 conexiones concurrentes
        
        // 📊 Monitoreo y logging
        monitorCommands: process.env.NODE_ENV === 'development',
      }
    };
  }

  private setupEventListeners(): void {
    // 📊 Eventos de conexión
    mongoose.connection.on('connected', () => {
      this.isConnected = true;
      dbLogger.info('✅ MongoDB Atlas connected successfully');
      dbLogger.info(`📍 Database: ${mongoose.connection.name}`);
    });

    mongoose.connection.on('error', (error) => {
      this.isConnected = false;
      dbLogger.error('❌ MongoDB connection error:', {
        message: error.message,
        code: (error as any).code,
        name: error.name
      });
    });

    mongoose.connection.on('disconnected', () => {
      this.isConnected = false;
      dbLogger.warn('⚠️  MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      this.isConnected = true;
      dbLogger.info('🔄 MongoDB reconnected');
    });

    // 🎯 Evento específico para serverless
    mongoose.connection.on('close', () => {
      this.isConnected = false;
      dbLogger.info('🔌 MongoDB connection closed');
    });

    // 🔧 Manejo de terminación del proceso
    const gracefulShutdown = async () => {
      try {
        await this.disconnect();
        process.exit(0);
      } catch (error) {
        dbLogger.error('❌ Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
  }

  async connect(): Promise<typeof mongoose> {
    try {
      // ⚡ Si ya hay una conexión en progreso, esperar por ella
      if (this.connectionPromise) {
        dbLogger.info('⏳ Using existing connection promise...');
        return await this.connectionPromise;
      }

      // ✅ Si ya está conectado, devolver la conexión existente
      if (this.isConnected && mongoose.connection.readyState === 1) {
        dbLogger.info('♻️  Using existing MongoDB connection');
        return mongoose;
      }

      // 🚀 Nueva conexión
      dbLogger.info('🔄 Connecting to MongoDB Atlas...');
      
      const config = this.getConfig();
      this.setupEventListeners();

      // 📊 Crear promesa de conexión
      this.connectionPromise = mongoose.connect(config.uri, config.options);
      
      const mongooseInstance = await this.connectionPromise;
      
      // ✅ Validar conexión
      if (mongoose.connection.readyState !== 1) {
        throw new Error('❌ Failed to establish MongoDB connection');
      }

      dbLogger.info('🎉 MongoDB Atlas connection established successfully');
      dbLogger.info(`📊 Connection details:`, {
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        database: mongoose.connection.name,
        readyState: mongoose.connection.readyState
      });

      return mongooseInstance;

    } catch (error) {
      this.isConnected = false;
      this.connectionPromise = null;
      
      dbLogger.error('❌ MongoDB connection failed:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (mongoose.connection.readyState !== 0) {
        dbLogger.info('🔌 Closing MongoDB connection...');
        await mongoose.disconnect();
        this.isConnected = false;
        this.connectionPromise = null;
        dbLogger.info('✅ MongoDB connection closed successfully');
      }
    } catch (error) {
      dbLogger.error('❌ Error closing MongoDB connection:', error);
      throw error;
    }
  }

  getConnectionStatus(): {
    isConnected: boolean;
    readyState: number;
    readyStateString: string;
    host?: string;
    port?: number;
    database?: string;
  } {
    const readyStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      readyStateString: readyStates[mongoose.connection.readyState as keyof typeof readyStates] || 'unknown',
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      database: mongoose.connection.name
    };
  }

  // 🛠️ Método para healthcheck
  async ping(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }
      
      await mongoose.connection.db!.admin().ping();
      return true;
    } catch (error) {
      dbLogger.error('❌ MongoDB ping failed:', error);
      return false;
    }
  }
}

export default DatabaseConnection;
export { DatabaseConnection };