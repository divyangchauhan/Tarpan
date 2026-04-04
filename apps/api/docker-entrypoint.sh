#!/bin/sh
set -e

# Assemble DATABASE_URL from the individual RDS secret fields injected by ECS.
# Node.js handles URL-encoding of special characters in the password.
export DATABASE_URL=$(node -e "
  const u = encodeURIComponent(process.env.DB_USERNAME || '');
  const p = encodeURIComponent(process.env.DB_PASSWORD || '');
  const h = process.env.DB_HOST || '';
  const d = process.env.DB_NAME || '';
  console.log('postgresql://' + u + ':' + p + '@' + h + ':5432/' + d);
")

exec "$@"
