import { VercelRequest, VercelResponse } from '@vercel/node';
import DatabaseConnection from '../../src/config/database';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 🔒 Solo permitir GET
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
      timestamp: new Date().toISOString()
    });
  }

  // Headers CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const db = DatabaseConnection.getInstance();
  
  try {
    // 🔗 Conectar a MongoDB
    console.log('🔄 Connecting to database for health check...');
    await db.connect();
    
    // 🏥 Ping test
    const isHealthy = await db.ping();
    const status = db.getConnectionStatus();
    
    console.log('✅ Health check completed successfully');
    
    return res.status(200).json({
      success: true,
      message: 'API and Database are healthy! 🎉',
      timestamp: new Date().toISOString(),
      database: {
        isConnected: status.isConnected,
        readyState: status.readyStateString,
        host: status.host,
        database: status.database,
        pingSuccess: isHealthy
      },
      environment: process.env.NODE_ENV || 'development',
      version: process.env.API_VERSION || '1.0.0',
      uptime: process.uptime()
    });
    
  } catch (error) {
    console.error('❌ Health check failed:', error);
    
    return res.status(503).json({
      success: false,
      message: 'Service temporarily unavailable',
      timestamp: new Date().toISOString(),
      database: {
        isConnected: false,
        error: process.env.NODE_ENV === 'development' ? 
          (error instanceof Error ? error.message : 'Unknown error') : 
          'Database connection failed'
      },
      environment: process.env.NODE_ENV || 'development',
      version: process.env.API_VERSION || '1.0.0'
    });
  }
}