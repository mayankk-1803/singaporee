import mongoose from 'mongoose';
import logger from '../utils/logger.js';

export const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('CRITICAL CONFIGURATION ERROR: Missing required environment variable: MONGODB_URI');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGODB_URI);
  logger.info('MongoDB Connected');
};

export default connectDB;
