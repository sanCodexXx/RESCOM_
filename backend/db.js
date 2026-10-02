const { Pool } = require('pg');
require('dotenv').config();

// Hosted Postgres (Neon, Supabase, Render, Azure...) usually gives one
// connection string and requires SSL -> set DATABASE_URL.
// Locally, the individual DB_* values from .env still work.
const useUrl = !!process.env.DATABASE_URL;
const pool = new Pool(
  useUrl
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
      }
    : {
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
      }
);

pool.on('error', (err) => {
  console.error('Unexpected Postgres error on idle client', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
