import { start } from './index.js';

start().catch(err => {
  console.error(err.message);
  process.exit(1);
});
