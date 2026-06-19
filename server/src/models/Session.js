import mongoose from 'mongoose';
import { apiTransformPlugin } from './plugins.js';

const SessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

SessionSchema.virtual('user', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true,
});
SessionSchema.plugin(apiTransformPlugin);

export const Session = mongoose.model('Session', SessionSchema);
export default Session;
