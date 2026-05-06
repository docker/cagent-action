/**
 * binary.ts — download and cache the docker-agent (and optionally mcp-gateway) binary.
 *
 * Ports the `Setup binaries` step of the original composite action.yml.
 *
 * Uses @actions/tool-cache for download + extract + caching (no post-step
 * needed — tool-cache manages its own lifecycle keyed on tool name + version).
 *
 * Binary download URLs:
 *   docker-agent:  https://github.com/docker/docker-agent/releases/download/<version>/<binary>
 *   mcp-gateway:   https://github.com/docker/mcp-gateway/releases/download/<version>/<tarball>
 *
 * The binary file names follow:
 *   docker-agent-<platform>-<arch>[.exe]
 *   docker-mcp-<platform>-<arch>.tar.gz
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as tc from '@actions/tool-cache';

export interface BinarySetupResult {
  /** Version string of docker-agent that was installed/found. */
  cagentVersion: string;
  /** Whether mcp-gateway was successfully installed. */
  mcpInstalled: boolean;
  /** Absolute path to the docker-agent binary. */
  dockerAgentPath: string;
}

/** Detect {platform, arch} strings used in release asset names. */
function detectPlatform(): { platform: string; arch: string; ext: string } {
  const rawPlatform = os.platform();
  const rawArch = os.arch();

  let platform: string;
  let ext = '';

  switch (rawPlatform) {
    case 'linux':
      platform = 'linux';
      break;
    case 'darwin':
      platform = 'darwin';
      break;
    case 'win32':
      platform = 'windows';
      ext = '.exe';
      break;
    default:
      throw new Error(`Unsupported operating system: ${rawPlatform}`);
  }

  let arch: string;
  switch (rawArch) {
    case 'x64':
    case 'amd64':
      arch = 'amd64';
      break;
    case 'arm64':
    case 'aarch64':
      arch = 'arm64';
      break;
    default:
      throw new Error(`Unsupported architecture: ${rawArch}`);
  }

  return { platform, arch, ext };
}

/**
 * Ensure the docker-agent binary is available on disk (cached or freshly downloaded).
 *
 * @param version   The version string (e.g. "v1.54.0") from DOCKER_AGENT_VERSION.
 * @param githubToken  Optional GitHub PAT for authenticated download (avoids rate-limits).
 * @returns Path to the docker-agent binary.
 */
async function ensureDockerAgent(version: string, githubToken?: string): Promise<string> {
  const { platform, arch, ext } = detectPlatform();
  const binaryName = `docker-agent${ext}`;
  const toolName = 'docker-agent';

  // Check tool cache first
  const cachedDir = tc.find(toolName, version);
  if (cachedDir) {
    core.info(`Using cached docker-agent ${version} from ${cachedDir}`);
    return path.join(cachedDir, binaryName);
  }

  // Download
  const assetName = `docker-agent-${platform}-${arch}${ext}`;
  const downloadUrl = `https://github.com/docker/docker-agent/releases/download/${version}/${assetName}`;
  core.info(`Downloading docker-agent ${version} for ${platform}-${arch}...`);
  core.info(`URL: ${downloadUrl}`);

  const auth = githubToken ? `token ${githubToken}` : undefined;
  const downloadedPath = await tc.downloadTool(downloadUrl, undefined, auth);

  // The docker-agent binary is a single executable (not a tarball)
  // Make it executable and cache it
  fs.chmodSync(downloadedPath, 0o755);

  // Create a temp directory to hold the binary under its canonical name
  const tmpBinDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'docker-agent-'));
  const binaryDest = path.join(tmpBinDir, binaryName);
  await fs.promises.copyFile(downloadedPath, binaryDest);
  fs.chmodSync(binaryDest, 0o755);

  // Cache for future runs
  const cachedResult = await tc.cacheDir(tmpBinDir, toolName, version);
  core.info(`Cached docker-agent ${version} at ${cachedResult}`);

  return path.join(cachedResult, binaryName);
}

/**
 * Ensure mcp-gateway is installed into ~/.docker/cli-plugins/docker-mcp.
 *
 * @param version  The mcp-gateway version string (e.g. "v0.22.0").
 * @param githubToken  Optional GitHub PAT for download.
 */
async function ensureMcpGateway(version: string, githubToken?: string): Promise<void> {
  const { platform, arch } = detectPlatform();
  const toolName = 'docker-mcp';
  const pluginDir = path.join(os.homedir(), '.docker', 'cli-plugins');
  const pluginBinary = os.platform() === 'win32' ? 'docker-mcp.exe' : 'docker-mcp';
  const pluginPath = path.join(pluginDir, pluginBinary);

  // Check tool cache
  const cachedDir = tc.find(toolName, version);
  if (cachedDir) {
    core.info(`Using cached mcp-gateway ${version}`);
    const cachedBinary = path.join(cachedDir, pluginBinary);
    await fs.promises.mkdir(pluginDir, { recursive: true });
    await fs.promises.copyFile(cachedBinary, pluginPath);
    fs.chmodSync(pluginPath, 0o755);
    return;
  }

  // Download tarball
  const assetName = `docker-mcp-${platform}-${arch}.tar.gz`;
  const downloadUrl = `https://github.com/docker/mcp-gateway/releases/download/${version}/${assetName}`;
  core.info(`Downloading mcp-gateway ${version} for ${platform}-${arch}...`);

  const auth = githubToken ? `token ${githubToken}` : undefined;
  const tarPath = await tc.downloadTool(downloadUrl, undefined, auth);
  const extractedDir = await tc.extractTar(tarPath);

  // The tarball contains docker-mcp (or docker-mcp.exe on windows)
  const extractedBinary = path.join(extractedDir, pluginBinary);
  fs.chmodSync(extractedBinary, 0o755);

  // Cache the extracted directory
  await tc.cacheDir(extractedDir, toolName, version);

  // Copy to plugin directory
  await fs.promises.mkdir(pluginDir, { recursive: true });
  await fs.promises.copyFile(extractedBinary, pluginPath);
  fs.chmodSync(pluginPath, 0o755);
}

/**
 * Set up docker-agent and (optionally) mcp-gateway binaries.
 *
 * After this function completes, `docker-agent` is available at the returned path.
 * The caller should add its parent directory to PATH if needed, or use the full path.
 *
 * @param opts.version           docker-agent version (from DOCKER_AGENT_VERSION file).
 * @param opts.mcpGateway        Whether to install mcp-gateway.
 * @param opts.mcpGatewayVersion mcp-gateway version (if installing).
 * @param opts.githubToken       GitHub token for authenticated downloads.
 * @param opts.debug             Enable verbose logging.
 */
export async function setupBinaries(opts: {
  version: string;
  mcpGateway: boolean;
  mcpGatewayVersion: string;
  githubToken?: string;
  debug?: boolean;
}): Promise<BinarySetupResult> {
  const { version, mcpGateway, mcpGatewayVersion, githubToken, debug } = opts;

  if (debug) {
    core.debug(`Setting up docker-agent ${version}`);
    core.debug(`MCP Gateway: ${mcpGateway ? mcpGatewayVersion : 'disabled'}`);
  }

  // Install docker-agent
  const dockerAgentPath = await ensureDockerAgent(version, githubToken);

  // Verify binary works
  core.info('Verifying docker-agent binary...');
  const verifyCode = await exec.exec(`"${dockerAgentPath}"`, ['version'], {
    ignoreReturnCode: true,
    silent: !debug,
  });
  if (verifyCode !== 0) {
    throw new Error(`docker-agent binary verification failed (exit code ${verifyCode})`);
  }

  // Install mcp-gateway if requested
  let mcpInstalled = false;
  if (mcpGateway) {
    await ensureMcpGateway(mcpGatewayVersion, githubToken);

    // Verify via `docker mcp version`
    core.info('Verifying mcp-gateway installation...');
    const mcpVerifyCode = await exec.exec('docker', ['mcp', 'version'], {
      ignoreReturnCode: true,
      silent: !debug,
    });
    if (mcpVerifyCode !== 0) {
      throw new Error(`mcp-gateway verification failed (exit code ${mcpVerifyCode})`);
    }
    mcpInstalled = true;
  }

  core.info(`✅ docker-agent ${version} ready at: ${dockerAgentPath}`);
  if (mcpInstalled) {
    core.info(`✅ mcp-gateway ${mcpGatewayVersion} installed`);
  }

  return { cagentVersion: version, mcpInstalled, dockerAgentPath };
}
