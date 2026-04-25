const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

function createCommandRunner(log) {
  return async function run(command, args, options = {}) {
    const fields = {
      command,
      args,
      deploymentId: options.deploymentId,
    };

    log("info", "command_started", fields);

    try {
      return await execFileAsync(command, args, {
        maxBuffer: 1024 * 1024 * 20,
        ...options,
      });
    } catch (error) {
      log("error", "command_failed", {
        ...fields,
        error: error.message,
        stderr: error.stderr,
      });
      throw error;
    }
  };
}

module.exports = { createCommandRunner };
