const fs = require("fs/promises");
const path = require("path");
const { GitError } = require("../errors/app-error");

function createGitService(run) {
  async function copyLocalDirectory(repositoryUrl, targetPath) {
    const sourcePath = repositoryUrl.replace("file://", "");
    const stat = await fs.stat(sourcePath);

    if (!stat.isDirectory()) {
      throw new Error(`${sourcePath} is not a directory`);
    }

    await fs.cp(sourcePath, targetPath, {
      recursive: true,
      filter: (source) => !source.includes(`${path.sep}node_modules`),
    });
  }

  async function cloneRepository(repositoryUrl, branch, targetPath, deploymentId) {
    await fs.rm(targetPath, { recursive: true, force: true });
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    if (repositoryUrl.startsWith("file://")) {
      const sourcePath = repositoryUrl.replace("file://", "");
      try {
        await fs.access(path.join(sourcePath, ".git"));
      } catch (error) {
        await copyLocalDirectory(repositoryUrl, targetPath);
        return;
      }
    }

    const args = ["clone", "--depth", "1"];
    if (branch) {
      args.push("--branch", branch);
    }
    args.push(repositoryUrl, targetPath);

    try {
      await run("git", args, { deploymentId });
    } catch (error) {
      throw new GitError("Failed to clone repository", {
        repositoryUrl,
        branch,
        stderr: error.stderr,
      });
    }
  }

  return { cloneRepository };
}

module.exports = { createGitService };
