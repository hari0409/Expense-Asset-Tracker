import db, { initDb } from '../db';

initDb()
  .then(() => {
    console.log('Database initialized.');
    db.close();
  })
  .catch((err) => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
