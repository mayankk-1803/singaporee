import mongoose from 'mongoose';
import { apiTransformPlugin } from './plugins.js';

const NotificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  email: { type: String, required: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  type: { type: String, required: true },
  sentAt: { type: Date, default: null },
  status: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

NotificationSchema.plugin(apiTransformPlugin);

export const Notification = mongoose.model('Notification', NotificationSchema);
export default Notification;
