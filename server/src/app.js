import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import mongoose from 'mongoose';
import { connectDB } from './config/database.js';
import { errorHandler } from './middleware/errorMiddleware.js';
import { apiLimiter } from './middleware/rateLimitMiddleware.js';
import logger from './utils/logger.js';

// Route Imports
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/users.routes.js';
import clinicsRoutes from './modules/clinics/clinics.routes.js';
import doctorsRoutes from './modules/doctors/doctors.routes.js';
import staffRoutes from './modules/staff/staff.routes.js';
import patientsRoutes from './modules/patients/patients.routes.js';
import certificatesRoutes from './modules/certificates/certificates.routes.js';
import verificationRoutes from './modules/verification/verification.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';
import systemRoutes from './modules/system/system.routes.js';
import { config } from './config/index.js';
import { validateCloudinaryConfig } from './config/cloudinary.js';

const app = express();

validateCloudinaryConfig();
await connectDB();

// Security Middlewares
app.use(helmet({
  crossOriginResourcePolicy: false,
}));

const allowedOrigins = [
  'https://healthcare-verification.vercel.app',
  config.clientUrl,
  'http://localhost:5173',
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/fallback-assets', express.static(config.fallbackUploadDir));

// Log requests
app.use((req, res, next) => {
  logger.info(`[${req.method}] ${req.url} - IP: ${req.ip}`);
  next();
});

// Swagger Setup
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'HealthVerify API Docs',
      version: '1.0.0',
      description: 'Production-Grade Healthcare Certificate Verification & Clinic Management Platform API Documentations',
    },
    servers: [
      {
        url: process.env.SERVER_URL || 'http://localhost:4000',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/modules/**/*.routes.js', './src/app.js'], // Path to API specifications
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Base Limiter
app.use('/api/', apiLimiter);

// Health Check Endpoint
app.get('/api/health', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      throw new Error('MongoDB connection is not ready');
    }

    return res.status(200).json({
      status: 'UP',
      database: 'CONNECTED',
      uptime: process.uptime(),
      timestamp: new Date(),
      version: '1.0.0',
    });
  } catch (error) {
    logger.error('Health check database failure:', error);
    return res.status(500).json({
      status: 'DEGRADED',
      database: 'DISCONNECTED',
      uptime: process.uptime(),
      timestamp: new Date(),
      version: '1.0.0',
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/clinics', clinicsRoutes);
app.use('/api/doctors', doctorsRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/certificates', certificatesRoutes);
app.use('/api/verify', verificationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/system', systemRoutes);

// Global Error Handler
app.use(errorHandler);

// Fallback 404
app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.url}` });
});

const PORT = config.port;
app.listen(PORT, () => {
  logger.info(`Healthcare Platform API running in [${config.env}] mode on port ${PORT}`);
  logger.info(`Swagger API documentation available at http://localhost:${PORT}/api/docs`);
});

export default app;
