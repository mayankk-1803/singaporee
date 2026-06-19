import mongoose from 'mongoose';

export const toObjectId = (id) => {
  if (!id) return id;
  if (id instanceof mongoose.Types.ObjectId) return id;
  return new mongoose.Types.ObjectId(String(id));
};

export const toObjectIdOrNull = (id) => (id ? toObjectId(id) : null);

export const isObjectId = (id) => mongoose.Types.ObjectId.isValid(String(id));

export const idOrNumberFilter = (id, numberField = 'certificateNumber') => ({
  $or: [
    ...(isObjectId(id) ? [{ _id: toObjectId(id) }] : []),
    { [numberField]: id },
  ],
});

export const serialize = (value) => {
  if (!value) return value;
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value.toJSON === 'function') return value.toJSON();
  return value;
};

export const regexContains = (value) => new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

export const notDeleted = { deletedAt: null };
