# HealthVerify Backend

Express API backed by MongoDB Atlas/Mongoose.

## Environment

Required:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/healthverify
JWT_SECRET=replace-me
JWT_REFRESH_SECRET=replace-me
```

Common optional settings:

```env
PORT=4000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
SERVER_URL=http://localhost:4000
VERIFICATION_SECRET=replace-me
```

## Commands

```bash
npm install
npm run seed
npm run dev
```

The database layer uses Mongoose models in `src/models`. No Prisma client, schema, or migrations are required.
