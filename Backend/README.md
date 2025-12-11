# Arag Hospital - Backend

## Setup

1. Copy `.env.example` to `.env` and fill values (MONGODB_URI, JWT secrets, SMTP, S3 if used).
2. Generate secure JWT secrets:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
