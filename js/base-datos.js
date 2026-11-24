const path = require('node:path');
const { readFileSync } = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

function openDatabase() {
  const root = path.resolve(__dirname, '..');
  const file = process.env.DB_FILE || 'basedatos/damnificados.sqlite';
  const schema = readFileSync(path.join(root, 'basedatos', 'esquema.sql'), 'utf8');
  const db = new DatabaseSync(file === ':memory:' ? file : path.resolve(root, file));

  try {
    db.exec('PRAGMA busy_timeout = 5000');
    inTransaction(db, () => db.exec(schema));
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function inTransaction(db, save) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = save();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

module.exports = { openDatabase, inTransaction };
