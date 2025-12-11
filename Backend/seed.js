// seed.js
require('dotenv').config();
const connectDB = require('./config/db');
const User = require('./models/User');

const DEFAULT = {
  username: process.env.SEED_ADMIN_USERNAME || 'admin',
  password: process.env.SEED_ADMIN_PASSWORD || 'Admin123!',
  fullName: process.env.SEED_ADMIN_FULLNAME || 'Administrator',
  email: process.env.SEED_ADMIN_EMAIL || 'admin@araghospital.com',
  role: 'admin'
};

async function run(){
  try {
    if (!process.env.MONGODB_URI) {
      console.error('MONGODB_URI not set in .env');
      process.exit(1);
    }

    await connectDB(process.env.MONGODB_URI);

    // If provided username looks like an email, use it as email too.
    let username = (DEFAULT.username || '').toLowerCase().trim();
    let email = (DEFAULT.email || '').toLowerCase().trim();

    if (username.includes('@')) {
      // user gave an email as username — use that email and set username to the full email (schema accepts @)
      email = username;
    } else if (!email) {
      // no email provided, derive from username
      email = `${username}@araghospital.local`;
    }

    // Find existing user by username OR email (so we update if either exists)
    let user = await User.findOne({ $or: [{ username }, { email }] });

    if (user) {
      user.role = 'admin';
      user.fullName = user.fullName || DEFAULT.fullName;
      user.email = user.email || email;
      // if user had no username or different, normalize username
      user.username = user.username || username;
      await user.save();
      console.log(`Updated existing user "${user.username}" to role=admin`);
    } else {
      user = new User({
        username,
        password: DEFAULT.password,
        fullName: DEFAULT.fullName,
        email,
        role: 'admin'
      });
      await user.save();
      console.log(`Created admin user "${username}" (password: ${DEFAULT.password})`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

run();
