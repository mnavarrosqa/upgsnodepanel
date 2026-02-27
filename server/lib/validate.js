/**
 * Validate and sanitize app input to prevent command injection and unsafe config.
 */

const MAX_LEN = {
  name: 100,
  branch: 200,
  repo_url: 2048,
  domain: 253,
  command: 500,
  node_version: 20,
};

const SAFE_BRANCH = /^[a-zA-Z0-9/_.-]+$/;
const SAFE_NAME = /^[a-zA-Z0-9_.-]+$/;
const SAFE_DOMAIN = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/;
const SAFE_COMMAND = /^[a-zA-Z0-9\s\-_./:]+$/;
const SAFE_NODE_VERSION = /^(\d+(\.\d+)*|lts|node)$/;
/** Commit SHA: 7-40 hex chars (short or full). */
const SAFE_SHA = /^[a-f0-9]{7,40}$/i;

function checkLength(value, max, field) {
  if (value != null && value.length > max) {
    throw new Error(`${field} must be at most ${max} characters`);
  }
}

export function validateRepoUrl(url) {
  if (url == null || typeof url !== 'string') return null;
  const s = url.trim();
  if (!s) return null;
  checkLength(s, MAX_LEN.repo_url, 'repo_url');
  if (/[\s;|&$`'"]/.test(s)) {
    throw new Error('repo_url contains invalid characters');
  }
  try {
    const u = new URL(s);
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'ssh:') {
      return s;
    }
    throw new Error('repo_url must be http, https, or ssh');
  } catch (e) {
    if (e.message === 'repo_url must be http, https, or ssh') throw e;
    if (e instanceof TypeError) {
      const scpLike = /^[^@\s]+@[^:]+:[^\s;|&$`'"]+$/;
      if (scpLike.test(s)) return s;
      throw new Error('repo_url must be a valid URL');
    }
    throw e;
  }
}

/** Returns branch/tag/ref string or null if empty (meaning auto-detect default branch). Accepts branch name, tag, or commit SHA. */
export function validateRef(ref) {
  if (ref == null || typeof ref !== 'string') return null;
  const s = ref.trim();
  if (!s) return null;
  checkLength(s, MAX_LEN.branch, 'branch');
  if (SAFE_SHA.test(s)) return s;
  if (SAFE_BRANCH.test(s)) return s;
  throw new Error('branch/tag/commit may only contain letters, numbers, /, ., _, -, or a 7–40 character hex commit SHA');
}

/** @deprecated Use validateRef for branch/tag/commit. */
export function validateBranch(branch) {
  return validateRef(branch);
}

export function validateName(name) {
  if (name == null || typeof name !== 'string') return null;
  const s = name.trim();
  if (!s) return null;
  checkLength(s, MAX_LEN.name, 'name');
  if (!SAFE_NAME.test(s)) {
    throw new Error('name may only contain letters, numbers, _, ., -');
  }
  return s;
}

export function validateDomain(domain) {
  if (domain == null || typeof domain !== 'string') return null;
  const s = domain.trim();
  if (!s) return null;
  checkLength(s, MAX_LEN.domain, 'domain');
  if (!SAFE_DOMAIN.test(s)) {
    throw new Error('domain must be a valid hostname');
  }
  return s;
}

export function validateCommand(cmd, field) {
  if (cmd == null || typeof cmd !== 'string') return null;
  const s = cmd.trim();
  if (!s) return null;
  checkLength(s, MAX_LEN.command, field);
  if (!SAFE_COMMAND.test(s)) {
    throw new Error(field + ' may only contain letters, numbers, spaces, and - _ . / :');
  }
  return s;
}

export function validateNodeVersion(v) {
  if (v == null || typeof v !== 'string') return '20';
  const s = String(v).trim();
  if (!s) return '20';
  checkLength(s, MAX_LEN.node_version, 'node_version');
  if (!SAFE_NODE_VERSION.test(s)) {
    throw new Error('node_version must be a version like 20 or 22.1.0, or lts/node');
  }
  return s;
}

/**
 * Validate app create/update payload. Returns sanitized object or throws.
 */
export function validateAppInput(data, isCreate = false) {
  const out = {};
  if (data.name !== undefined) {
    const n = validateName(data.name);
    if (isCreate && !n) throw new Error('name is required');
    out.name = n;
  }
  if (data.repo_url !== undefined) {
    const u = validateRepoUrl(data.repo_url);
    if (isCreate && !u) throw new Error('repo_url is required');
    out.repo_url = u;
  }
  if (data.branch !== undefined) out.branch = validateRef(data.branch);
  if (data.domain !== undefined) out.domain = validateDomain(data.domain);
  if (data.install_cmd !== undefined) {
    const c = validateCommand(data.install_cmd, 'install_cmd');
    out.install_cmd = c || undefined;
  }
  if (data.build_cmd !== undefined) {
    const c = validateCommand(data.build_cmd, 'build_cmd');
    out.build_cmd = c || undefined;
  }
  if (data.start_cmd !== undefined) {
    const c = validateCommand(data.start_cmd, 'start_cmd');
    out.start_cmd = c || undefined;
  }
  if (data.node_version !== undefined) out.node_version = validateNodeVersion(data.node_version);
  if (data.ssl_enabled !== undefined) out.ssl_enabled = Boolean(data.ssl_enabled);
  if (data.max_restarts !== undefined) out.max_restarts = data.max_restarts === null ? null : validateMaxRestarts(data.max_restarts);
  if (data.restart_delay !== undefined) out.restart_delay = data.restart_delay === null ? null : validateRestartDelay(data.restart_delay);
  return out;
}

/** Optional max restarts (0–999999). Empty/null => undefined. */
export function validateMaxRestarts(v) {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 999999) {
    throw new Error('max_restarts must be an integer between 0 and 999999');
  }
  return n;
}

/** Optional restart delay in ms (0–600000). Empty/null => undefined. */
export function validateRestartDelay(v) {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > 600000) {
    throw new Error('restart_delay must be an integer between 0 and 600000 (ms)');
  }
  return n;
}
