import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Simple logger para el test
const logger = {
  info: (message: string, data?: any) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, data || '');
  },
  error: (message: string, error?: any) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error || '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, data || '');
  }
};

async function testMongoDBConnection() {
  logger.info('🚀 Starting MongoDB Atlas connection test...');
  
  try {
    // Verificar variables de entorno
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('❌ MONGODB_URI not found in environment variables');
    }
    
    logger.info('✅ Environment variables loaded');
    logger.info(`🔗 Connecting to: ${mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    
    // 🔗 Intentar conexión con configuración optimizada
    logger.info('🔄 Attempting to connect to MongoDB Atlas...');
    
    await mongoose.connect(mongoUri, {
      maxPoolSize: 5,
      minPoolSize: 1,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: 'majority',
      family: 4
    });
    
    // 📊 Mostrar estado de conexión
    const connection = mongoose.connection;
    logger.info('✅ MongoDB Atlas connected successfully');
    logger.info('📊 Connection Status:', {
      readyState: connection.readyState,
      host: connection.host,
      port: connection.port,
      name: connection.name
    });
    
    // 🏥 Ping test
    logger.info('🏥 Testing connection health...');
    if (!connection.db) {
      throw new Error('❌ Database connection not established');
    }
    // 📋 Listar colecciones
    logger.info('📋 Listing collections...');
    const collections = await connection.db!.listCollections().toArray();
    logger.info(`📁 Found ${collections.length} collections:`, 
      collections.map(col => col.name)
    );
    
    // ✅ Test básico de operación
    logger.info('🧪 Testing basic database operations...');
    const testCollection = connection.db!.collection('connection_test');
    
    // Insertar documento de prueba
    const testDoc = { 
      test: true, 
      timestamp: new Date(), 
      message: 'Connection test successful' 
    };
    
    const insertResult = await testCollection.insertOne(testDoc);
    logger.info('✅ Insert test successful:', insertResult.insertedId);
    
    // Leer documento de prueba
    const foundDoc = await testCollection.findOne({ _id: insertResult.insertedId });
    logger.info('✅ Read test successful:', foundDoc?.message);
    
    // Limpiar documento de prueba
    await testCollection.deleteOne({ _id: insertResult.insertedId });
    logger.info('✅ Delete test successful');
    
    logger.info('🎉 MongoDB Atlas connection test completed successfully!');
    
  } catch (error) {
    logger.error('❌ MongoDB Atlas connection test failed:', error);
    if (error instanceof Error) {
      logger.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
    process.exit(1);
  } finally {
    // 🔌 Cerrar conexión
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      logger.info('🔌 Connection closed');
    }
    logger.info('👋 Connection test finished. Goodbye!');
    process.exit(0);
  }
}

// 🚀 Ejecutar test con manejo de errores
testMongoDBConnection().catch((error) => {
  logger.error('❌ Unhandled error in connection test:', error);
  process.exit(1);
});