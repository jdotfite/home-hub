import { migrate, dbPath } from '../src/db.js';
migrate();
console.log(`Database ready at ${dbPath}`);
