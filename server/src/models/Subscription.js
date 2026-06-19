import mongoose from 'mongoose';
import { apiTransformPlugin } from './plugins.js';

const SubscriptionSchema = new mongoose.Schema({
  clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic', required: true, index: true },
  planName: { type: String, required: true },
  status: { type: String, required: true },
  price: { type: Number, required: true, default: 0 },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
}, { timestamps: true });

SubscriptionSchema.virtual('clinic', {
  ref: 'Clinic',
  localField: 'clinicId',
  foreignField: '_id',
  justOne: true,
});
SubscriptionSchema.plugin(apiTransformPlugin);

export const Subscription = mongoose.model('Subscription', SubscriptionSchema);
export default Subscription;
