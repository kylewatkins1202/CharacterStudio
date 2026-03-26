/**
 * db/settings.js
 *
 * User settings — extends DbTable for file initialization and low-level I/O,
 * adds typed accessors for the single settings record.
 *
 * Exports a singleton instance.
 */

const DbTable = require("./DbTable");
const { SETTINGS_PATH } = require("./core");

class SettingsTable extends DbTable {
  constructor() {
    super();
    // Absolute path to the settings JSON file
    this.DIRECTORY   = SETTINGS_PATH;
    // Default structure written on first run
    this.declaration = { wavespeedApiKey: "" };
  }

  // ─── Settings accessors ───────────────────────────────────────────────────────

  /**
   * Return the full settings object.
   *
   * @returns {Promise<{ wavespeedApiKey: string }>}
   */
  async getSettings() {
    return this.read();
  }

  /**
   * Merge a partial update into the settings object and persist it.
   *
   * Only known keys are written; unknown keys in `patch` are ignored.
   *
   * @param {{ wavespeedApiKey?: string }} patch
   * @returns {Promise<{ wavespeedApiKey: string }>}
   */
  async saveSettings(patch) {
    const current = await this.read();
    // Only allow updating known fields
    if (typeof patch.wavespeedApiKey === "string") {
      current.wavespeedApiKey = patch.wavespeedApiKey;
    }
    await this.write(current);
    return current;
  }
}

module.exports = new SettingsTable();
