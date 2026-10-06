// Jest gives each test file its own copy of process.env, so a test cannot
// change the process timezone itself. This environment runs in the real
// worker process: it pins TZ=UTC for the fixture file only (spec §3 —
// fixtures never depend on the machine's timezone) and restores it on
// teardown so later files in the same worker are unaffected.
const { TestEnvironment } = require('jest-environment-node');

class UtcEnvironment extends TestEnvironment {
  async setup() {
    this.originalTz = process.env.TZ;
    process.env.TZ = 'UTC';
    await super.setup();
  }

  async teardown() {
    if (this.originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = this.originalTz;
    await super.teardown();
  }
}

module.exports = UtcEnvironment;
