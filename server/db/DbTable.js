/**
 * db/DbTable.js
 *
 * Base class representing a single JSON-file database table.
 *
 * Each table has a file path (DIRECTORY) and a default declaration that is
 * written to disk when the file does not yet exist. The ensureDbTable method
 * is bound in the constructor so it can be passed around or spread into
 * module.exports without losing its `this` context.
 */

const fs = require("fs/promises");

class DbTable {
  /**
   * @param {string} filePath    - Absolute path to the JSON file for this table.
   * @param {object} declaration - Default structure written if the file is missing.
   */
  constructor(filePath, declaration) {
    // Absolute path to the backing JSON file
    this.DIRECTORY   = filePath;
    // Default structure seeded when the file does not exist
    this.declaration = declaration;

    // Bind so the method survives being spread into module.exports
    this.ensureDbTable = this.ensureDbTable.bind(this);
  }

  /**
   * Ensure the table's JSON file exists on disk.
   *
   * If the file is already present, this is a no-op.
   * If it is missing, it is created with the declaration as its initial content.
   *
   * @returns {Promise<void>}
   */
  async ensureDbTable() {
    try {
      // Check whether the file exists — throws if absent
      await fs.access(this.DIRECTORY);
    } catch {
      // File does not exist — seed it with the default declaration
      await fs.writeFile(this.DIRECTORY, JSON.stringify(this.declaration, null, 2), "utf8");
    }
  }

  /**
   * Read and parse the table's JSON file from disk.
   *
   * @returns {Promise<object>}
   */
  async read() {
    const raw = await fs.readFile(this.DIRECTORY, "utf8");
    return JSON.parse(raw);
  }

  /**
   * Serialize and write data to the table's JSON file on disk.
   *
   * @param {object} data
   * @returns {Promise<void>}
   */
  async write(data) {
    await fs.writeFile(this.DIRECTORY, JSON.stringify(data, null, 2), "utf8");
  }
}

module.exports = DbTable;
