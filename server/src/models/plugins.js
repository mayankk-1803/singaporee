const normalizeValue = (value) => {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value instanceof Date) return value;
  if (typeof value?.toHexString === 'function') return value.toHexString();
  if (typeof value === 'object') {
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === '_id' || key === '__v') continue;
      output[key] = normalizeValue(child);
    }
    return output;
  }
  return value;
};

export const apiTransformPlugin = (schema) => {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
      ret.id = ret.id || ret._id?.toString();
      delete ret._id;
      return normalizeValue(ret);
    },
  });

  schema.set('toObject', {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
      ret.id = ret.id || ret._id?.toString();
      delete ret._id;
      return normalizeValue(ret);
    },
  });
};

export const softDeletePlugin = (schema) => {
  const addNotDeletedFilter = function addNotDeletedFilter() {
    const filter = this.getFilter();
    if (filter.deletedAt === undefined) {
      this.where({ deletedAt: null });
    }
  };

  schema.pre(/^find/, addNotDeletedFilter);
  schema.pre('countDocuments', addNotDeletedFilter);
};
