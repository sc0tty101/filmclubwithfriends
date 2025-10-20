// utils/dbHelpers.js - Promise-based database helpers for async/await

// Promisify database.get
function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Promisify database.all
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// Promisify database.run
function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// Execute multiple SQL statements in a transaction
async function dbTransaction(db, operations) {
  await dbRun(db, 'BEGIN TRANSACTION');
  try {
    const results = [];
    for (const op of operations) {
      const result = await dbRun(db, op.sql, op.params);
      results.push(result);
    }
    await dbRun(db, 'COMMIT');
    return results;
  } catch (err) {
    await dbRun(db, 'ROLLBACK');
    throw err;
  }
}

module.exports = {
  dbGet,
  dbAll,
  dbRun,
  dbTransaction
};
