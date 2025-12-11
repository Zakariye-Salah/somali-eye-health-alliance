// config/index.js
require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 4000;

// single canonical Mongo env name
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || null;

// single canonical JWT secret and expiry
const JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || 'dev_jwt_secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || process.env.JWT_EXPIRES || '7d';

// other config values you might reference
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

module.exports = {
  NODE_ENV,
  PORT,
  MONGODB_URI,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  APP_BASE_URL,
  CORS_ORIGIN,
};
