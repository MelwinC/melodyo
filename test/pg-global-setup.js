import { spawn } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';

// Un vrai PostgreSQL éphémère pour les tests serveur, sans Docker (Mac, Linux, Windows, CI)
export default async function setup(project) {
  const child = spawn(process.execPath, [path.join(import.meta.dirname, 'pg-server.js')], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const exited = new Promise(resolve => child.once('exit', resolve));

  const line = await new Promise((resolve, reject) => {
    readline.createInterface({ input: child.stdout }).once('line', resolve);
    child.once('exit', code => reject(new Error(`PostgreSQL de test arrêté (code ${code})`)));
  });
  project.provide('databaseUrl', JSON.parse(line).url);

  return async () => {
    child.stdin.end();
    await exited;
  };
}
