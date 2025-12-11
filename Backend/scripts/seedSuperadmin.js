// scripts/seedSuperadmin.js
require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

// adjust these paths if your project layout differs
const connectDB = require(path.join(__dirname, '..', 'config', 'db')); // optional if you have a connect function
// fallback to mongoose.connect below if the above isn't available
const User = require(path.join(__dirname, '..', 'models', 'User'));

async function main() {
  const MONGODB_URI = process.env.MONGODB_URI || process.env.DB_URI || 'mongodb://localhost:27017/seha';
  if (!MONGODB_URI) {
    console.error('No MONGODB_URI set. Set MONGODB_URI in your environment or .env file.');
    process.exit(1);
  }

  // Connect (prefer your project's connectDB if available)
  try {
    if (typeof connectDB === 'function') {
      // If your connectDB accepts a uri param
      try {
        await connectDB(MONGODB_URI);
      } catch (e) {
        // fallback to direct mongoose.connect
        await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
      }
    } else {
      await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    }
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  }

  // Customize these default creds
  const DEFAULT = {
    fullName: process.env.SUPERADMIN_FULLNAME || 'Super Admin',
    username: process.env.SUPERADMIN_USERNAME || 'superadmin',
    email: process.env.SUPERADMIN_EMAIL || 'superadmin@example.org',
    password: process.env.SUPERADMIN_PASSWORD || 'ChangeMeNow123!' // change this immediately on production
  };

  try {
    // prefer lookup by username/email to avoid duplicates
    const byUsername = await User.findOne({ username: DEFAULT.username.toLowerCase().trim() });
    const byEmail = await User.findOne({ email: DEFAULT.email.toLowerCase().trim() });

    if (byUsername || byEmail) {
      const existing = byUsername || byEmail;
      console.log('Superadmin already exists:');
      console.log('  id:', existing._id.toString());
      console.log('  username:', existing.username);
      console.log('  email:', existing.email);
      console.log('If you want to reset the password, either update in DB or delete the user and re-run this script.');
      process.exit(0);
    }

    const user = new User({
      fullName: DEFAULT.fullName,
      username: String(DEFAULT.username).trim().toLowerCase(),
      email: DEFAULT.email ? String(DEFAULT.email).trim().toLowerCase() : undefined,
      password: DEFAULT.password,
      role: 'superadmin'
    });

    await user.save();

    console.log('Superadmin created successfully!');
    console.log('  id:', user._id.toString());
    console.log('  username:', user.username);
    console.log('  email:', user.email);
    console.log('  password (plain):', DEFAULT.password);
    console.log('');
    console.log('IMPORTANT: change the password immediately via /api/auth/me (PUT) or delete this user and re-seed with a safer password.');
    process.exit(0);
  } catch (err) {
    console.error('Error creating superadmin:', err);
    process.exit(1);
  }
}

main();
