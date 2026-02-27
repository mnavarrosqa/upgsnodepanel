<template>
  <div>
    <h1 class="page-title">Apps</h1>
    <div class="card" :class="{ 'is-disabled': creating }">
      <button type="button" class="btn btn-primary" @click="showForm = true" :disabled="creating">Add app</button>
    </div>
    <div class="card" v-if="showForm" :class="{ 'is-disabled': creating }">
      <h3 style="margin:0 0 1rem;">New app</h3>
      <div class="source-type-tabs">
        <button type="button" class="source-type-tab" :class="{ active: sourceType === 'git' }" @click="sourceType = 'git'">From Git</button>
        <button type="button" class="source-type-tab" :class="{ active: sourceType === 'zip' }" @click="sourceType = 'zip'">From ZIP</button>
      </div>
      <form @submit.prevent="create">
        <fieldset :disabled="creating">
        <div class="form-group">
          <label>Name</label>
          <div class="field-with-help">
            <input v-model="form.name" type="text" required placeholder="my-app" />
            <span class="help-wrap">
              <button type="button" class="help-trigger" aria-label="Help" @mouseenter="onHelpMouseEnter('name')" @mouseleave="onHelpMouseLeave" @click.prevent="onHelpClick('name')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              </button>
              <span class="help-tooltip" :class="{ visible: openHelpId === 'name' }">{{ fieldHelp.name }}</span>
            </span>
          </div>
        </div>
        <template v-if="sourceType === 'git'">
        <div class="form-group">
          <label>Repository visibility</label>
          <div class="repo-visibility-options">
            <label class="radio-label">
              <input type="radio" v-model="repoVisibility" value="public" />
              <span>Public</span>
            </label>
            <label class="radio-label">
              <input type="radio" v-model="repoVisibility" value="private" />
              <span>Private</span>
            </label>
          </div>
        </div>
        <div v-if="repoVisibility === 'private'" class="form-group private-repo-info">
          <div class="private-repo-info__box">
            <p class="private-repo-info__title">To clone a private repository you need one of the following:</p>
            <ul class="private-repo-info__list">
              <li><strong>HTTPS with token</strong> — Use a Personal Access Token (PAT) in the URL: <code>https://YOUR_TOKEN@github.com/user/repo.git</code>. Create a PAT with repo scope in GitHub (Settings → Developer settings) or GitLab (Preferences → Access Tokens). Do not share your token.</li>
              <li><strong>SSH</strong> — Use an SSH URL: <code>git@github.com:user/repo.git</code>. Add the server’s SSH public key below as a deploy key in the repository settings (GitHub: Settings → Deploy keys; GitLab: Settings → Repository → Deploy keys).</li>
            </ul>
            <div v-if="repoVisibility === 'private'" class="private-repo-info__ssh-key">
              <p class="private-repo-info__ssh-key-label">Server SSH public key to add as deploy key:</p>
              <div v-if="sshKeyLoading" class="private-repo-info__ssh-key-loading">Loading…</div>
              <div v-else-if="sshKeyError" class="private-repo-info__ssh-key-error">{{ sshKeyError }}</div>
              <div v-else-if="sshPublicKey" class="private-repo-info__ssh-key-block">
                <code class="private-repo-info__ssh-key-content">{{ sshPublicKey }}</code>
                <button type="button" class="btn btn-small private-repo-info__copy" @click="copySshKey" aria-label="Copy key">{{ copySshKeyFeedback ? 'Copied!' : 'Copy' }}</button>
              </div>
            </div>
            <p class="private-repo-info__note">“Suggest from repo” only works for public repos; for private repos fill install/build/start commands manually or use a preset.</p>
          </div>
        </div>
        <div class="form-group">
          <label>Repository URL</label>
          <div class="field-with-help">
            <input
            v-model="form.repo_url"
            type="text"
            required
            placeholder="https://github.com/user/repo.git or git@github.com:user/repo.git"
            @blur="fetchDefaultBranchIfEmpty"
          />
            <span class="help-wrap">
              <button type="button" class="help-trigger" aria-label="Help" @mouseenter="onHelpMouseEnter('repo_url')" @mouseleave="onHelpMouseLeave" @click.prevent="onHelpClick('repo_url')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              </button>
              <span class="help-tooltip" :class="{ visible: openHelpId === 'repo_url' }">{{ fieldHelp.repo_url }}</span>
            </span>
          </div>
        </div>
        <div class="form-group">
          <label>Branch, tag, or commit</label>
          <div class="field-with-help">
            <input
            v-model="form.branch"
            type="text"
            placeholder="main, v1.0.0, or abc1234"
            @focus="fetchDefaultBranchIfEmpty"
          />
            <span class="help-wrap">
              <button type="button" class="help-trigger" aria-label="Help" @mouseenter="onHelpMouseEnter('branch')" @mouseleave="onHelpMouseLeave" @click.prevent="onHelpClick('branch')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              </button>
              <span class="help-tooltip" :class="{ visible: openHelpId === 'branch' }">{{ fieldHelp.branch }}</span>
            </span>
          </div>
          <p class="form-hint">Use a branch name, a tag (e.g. v1.0.0), or a commit SHA.</p>
          <p v-if="branchDetected" class="domain-check domain-check--ok">{{ branchDetected }}</p>
        </div>
        <div class="form-group">
          <label>Suggest from repo</label>
          <div class="field-with-help suggest-field">
            <div class="suggest-row">
            <button
              type="button"
              class="btn"
              :disabled="!form.repo_url?.trim() || suggestLoading"
              @click="suggestFromRepo"
            >
              {{ suggestLoading ? 'Fetching…' : 'Suggest from repo' }}
            </button>
            <span v-if="suggestError" class="suggest-error">{{ suggestError }}</span>
          </div>
            <span class="help-wrap">
              <button type="button" class="help-trigger" aria-label="Help" @mouseenter="onHelpMouseEnter('suggest')" @mouseleave="onHelpMouseLeave" @click.prevent="onHelpClick('suggest')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              </button>
              <span class="help-tooltip" :class="{ visible: openHelpId === 'suggest' }">{{ fieldHelp.suggest }}</span>
            </span>
          </div>
        </div>
        </template>
        <div v-else class="form-group">
          <label>Project ZIP</label>
          <div class="field-with-help">
            <input type="file" accept=".zip" @change="onZipSelect" />
            <span class="help-wrap">
              <button type="button" class="help-trigger" aria-label="Help" @mouseenter="onHelpMouseEnter('zip')" @mouseleave="onHelpMouseLeave" @click.prevent="onHelpClick('zip')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              </button>
              <span class="help-tooltip" :class="{ visible: openHelpId === 'zip' }">{{ fieldHelp.zip }}</span>
            </span>
          </div>
          <p class="form-hint">Upload a .zip of your Node project (must contain package.json at root or in a single root folder).</p>
        </div>
        <div class="form-group">
          <label>Use preset</label>
          <div class="field-with-help">
            <select v-model="selectedPresetId" @change="applyPreset">
            <option value="">None</option>
            <option v-for="p in presets" :key="p.id" :value="p.id">{{ p.label }}</option>
          </select>
            <span class="help-wrap">
              <button type="button" class="help-trigger" aria-label="Help" @mouseenter="onHelpMouseEnter('preset')" @mouseleave="onHelpMouseLeave" @click.prevent="onHelpClick('preset')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              </button>
              <span class="help-tooltip" :class="{ visible: openHelpId === 'preset' }">{{ fieldHelp.preset }}</span>
            </span>
          </div>
        </div>
        <div class="form-group">
          <label>Node version</label>
          <div class="field-with-help">
            <select v-if="nodeVersions.length" v-model="form.node_version">
            <option v-for="v in nodeVersions" :key="v" :value="v">{{ v }}</option>
          </select>
          <template v-else>
            <input v-model="form.node_version" type="text" placeholder="20" />
          </template>
            <span class="help-wrap">
              <button type="button" class="help-trigger" aria-label="Help" @mouseenter="onHelpMouseEnter('node_version')" @mouseleave="onHelpMouseLeave" @click.prevent="onHelpClick('node_version')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              </button>
              <span class="help-tooltip" :class="{ visible: openHelpId === 'node_version' }">{{ fieldHelp.node_version }}</span>
            </span>
          </div>
          <p v-if="!nodeVersions.length" style="margin:0.25rem 0 0; font-size:0.8rem; color:var(--text-muted);">No versions installed. <router-link to="/node">Install one</router-link> or type a version to install later.</p>
        </div>
        <div class="form-group">
          <label>Install command</label>
          <div class="field-with-help">
            <input v-model="form.install_cmd" type="text" placeholder="npm install" />
            <span class="help-wrap">
              <button type="button" class="help-trigger" aria-label="Help" @mouseenter="onHelpMouseEnter('install_cmd')" @mouseleave="onHelpMouseLeave" @click.prevent="onHelpClick('install_cmd')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              </button>
              <span class="help-tooltip" :class="{ visible: openHelpId === 'install_cmd' }">{{ fieldHelp.install_cmd }}</span>
            </span>
          </div>
        </div>
        <div class="form-group">
          <label>Build command (optional)</label>
          <div class="field-with-help">
            <input v-model="form.build_cmd" type="text" placeholder="npm run build" />
            <span class="help-wrap">
              <button type="button" class="help-trigger" aria-label="Help" @mouseenter="onHelpMouseEnter('build_cmd')" @mouseleave="onHelpMouseLeave" @click.prevent="onHelpClick('build_cmd')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              </button>
              <span class="help-tooltip" :class="{ visible: openHelpId === 'build_cmd' }">{{ fieldHelp.build_cmd }}</span>
            </span>
          </div>
        </div>
        <div class="form-group">
          <label>Start command</label>
          <div class="field-with-help">
            <input v-model="form.start_cmd" type="text" placeholder="npm start" />
            <span class="help-wrap">
              <button type="button" class="help-trigger" aria-label="Help" @mouseenter="onHelpMouseEnter('start_cmd')" @mouseleave="onHelpMouseLeave" @click.prevent="onHelpClick('start_cmd')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              </button>
              <span class="help-tooltip" :class="{ visible: openHelpId === 'start_cmd' }">{{ fieldHelp.start_cmd }}</span>
            </span>
          </div>
        </div>
        <div class="form-group">
          <label>Domain (optional)</label>
          <div class="field-with-help">
            <input
            v-model="form.domain"
            type="text"
            placeholder="app.example.com"
            @blur="checkDomain"
          />
            <span class="help-wrap">
              <button type="button" class="help-trigger" aria-label="Help" @mouseenter="onHelpMouseEnter('domain')" @mouseleave="onHelpMouseLeave" @click.prevent="onHelpClick('domain')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              </button>
              <span class="help-tooltip" :class="{ visible: openHelpId === 'domain' }">{{ fieldHelp.domain }}</span>
            </span>
          </div>
          <p v-if="domainCheckStatus === 'checking'" class="domain-check domain-check--checking">Checking domain…</p>
          <p v-else-if="domainCheckStatus === 'ok'" class="domain-check domain-check--ok">{{ domainCheckMessage }}</p>
          <p v-else-if="domainCheckStatus === 'warn'" class="domain-check domain-check--warn">{{ domainCheckMessage }}</p>
          <p v-else-if="domainCheckStatus === 'error'" class="domain-check domain-check--error">{{ domainCheckMessage }}</p>
        </div>
        <div class="form-group">
          <label>Enable SSL</label>
          <div class="field-with-help">
            <select v-model="sslEnabledOption">
              <option value="0">No</option>
              <option value="1">Yes</option>
            </select>
            <span class="help-wrap">
              <button type="button" class="help-trigger" aria-label="Help" @mouseenter="onHelpMouseEnter('ssl_enabled')" @mouseleave="onHelpMouseLeave" @click.prevent="onHelpClick('ssl_enabled')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
              </button>
              <span class="help-tooltip" :class="{ visible: openHelpId === 'ssl_enabled' }">{{ fieldHelp.ssl_enabled }}</span>
            </span>
          </div>
          <p class="form-hint">Requires a domain and server reachable on ports 80 and 443.</p>
        </div>
        <div class="action-btns" style="margin-top:1rem;">
          <button type="submit" class="btn btn-primary" :disabled="creating">Create app</button>
          <button type="button" class="btn" @click="closeForm" :disabled="creating">Cancel</button>
        </div>
        </fieldset>
      </form>
      <p v-if="createError" style="margin-top:0.5rem; color:var(--danger);">{{ createError }}</p>
    </div>
    <div v-if="creating || creationDone" class="creation-overlay" @click.self="closeCreationOverlay">
      <div class="creation-modal card">
        <div v-if="creating" class="creation-progress">
          <h3 style="margin:0 0 0.75rem; font-size:1rem;">Creating app…</h3>
          <div class="creation-progress-bar" role="progressbar" :aria-valuenow="creationProgress" aria-valuemin="0" aria-valuemax="100">
            <div class="creation-progress-fill" :style="{ width: creationProgress + '%' }"></div>
          </div>
          <p class="creation-step-label">{{ creationStep }}</p>
          <p class="creation-log-label">Live log</p>
          <pre ref="creationLogsEl" class="creation-logs">{{ creationLogs }}</pre>
        </div>
        <div v-else class="creation-done">
          <h3 style="margin:0 0 0.5rem; font-size:1rem;">{{ createError ? 'Creation failed' : 'App created' }}</h3>
          <p v-if="createError" style="margin:0 0 1rem; font-size:0.875rem; color:var(--danger);">{{ createError }}</p>
          <p v-else style="margin:0 0 1rem; font-size:0.875rem; color:var(--text-muted);">The app is running. You can open it from the list below.</p>
          <p v-if="creationSslWarning" style="margin:0 0 1rem; font-size:0.875rem; color:var(--warn);">SSL could not be obtained: {{ creationSslWarning }}</p>
          <pre v-if="creationLogs && (createError || creationStep)" class="creation-logs">{{ creationStep }}\n{{ creationLogs }}</pre>
          <button type="button" class="btn btn-primary" @click="closeCreationOverlay" style="margin-top:1rem;">Close</button>
        </div>
      </div>
    </div>
    <p v-if="loadError" style="color:var(--danger); margin-bottom:1rem;">{{ loadError }}</p>
    <div class="card" :class="{ 'is-disabled': creating }">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Domain</th>
              <th>Port</th>
              <th>Size</th>
              <th>SSL</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="app in apps" :key="app.id">
              <td><router-link :to="`/apps/${app.id}`">{{ app.name }}</router-link></td>
              <td>{{ app.domain || '—' }}</td>
              <td>{{ app.port }}</td>
              <td>{{ formatSize(app.size) }}</td>
              <td>
                <span v-if="app.ssl_active" class="badge badge-success" title="SSL active">SSL ✓</span>
                <span v-else-if="app.ssl_enabled" class="badge badge-warn" title="Certificate pending">SSL …</span>
                <span v-else class="ssl-off">—</span>
              </td>
              <td><span class="badge" :class="app.status === 'running' ? 'badge-success' : 'badge-muted'">{{ app.status }}</span></td>
              <td>
                <div class="list-actions">
                  <router-link :to="`/apps/${app.id}`" class="btn btn-sm">Open</router-link>
                  <button type="button" class="btn btn-sm" title="Start" :disabled="app.status === 'running' || busyId === app.id" @click="doStart(app)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                  </button>
                  <button type="button" class="btn btn-sm" title="Stop" :disabled="app.status !== 'running' || busyId === app.id" @click="doStop(app)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                  </button>
                  <button type="button" class="btn btn-sm" title="Restart" :disabled="busyId === app.id" @click="doRestart(app)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
                  </button>
                  <button type="button" class="btn btn-sm btn-danger" title="Delete" :disabled="busyId === app.id" @click="confirmDelete(app)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="apps.length === 0" style="margin:0; color:var(--text-muted);">No apps. Add one above.</p>
    </div>
    <div v-if="showDeleteModal && appToDelete" class="modal-overlay" @click.self="closeDeleteModal">
      <div class="confirm-dialog confirm-dialog--danger">
        <div class="confirm-dialog__icon" aria-hidden="true">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </div>
        <h3 class="confirm-dialog__title">Delete app</h3>
        <p class="confirm-dialog__message">Permanently delete <strong>{{ appToDelete.name }}</strong>? This cannot be undone.</p>
        <ul class="confirm-dialog__list">
          <li>Stop and remove from PM2</li>
          <li>Remove nginx config (if any)</li>
          <li>Remove app record and delete the app folder on disk</li>
        </ul>
        <p v-if="deleteError" class="confirm-dialog__error">{{ deleteError }}</p>
        <div class="confirm-dialog__actions">
          <button type="button" class="btn" @click="closeDeleteModal" :disabled="deleting">Cancel</button>
          <button type="button" class="btn btn-danger" @click="doDelete" :disabled="deleting">{{ deleting ? 'Deleting…' : 'Delete permanently' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { api } from '../api';

const apps = ref([]);
const showForm = ref(false);
const creating = ref(false);
const creationDone = ref(false);
const createError = ref('');
const creationStep = ref('');
const creationLogs = ref('');
const creationProgress = ref(0);
const creationLogsEl = ref(null);
const creationSslWarning = ref('');
const domainCheckStatus = ref('');
const domainCheckMessage = ref('');
const branchDetected = ref('');
const nodeVersions = ref([]);
const sourceType = ref('git');
const zipFile = ref(null);
const selectedPresetId = ref('');
const suggestLoading = ref(false);
const suggestError = ref('');
const openHelpId = ref(null);
const helpPinned = ref(false);
const repoVisibility = ref('public');
const sshPublicKey = ref(null);
const sshKeyLoading = ref(false);
const sshKeyError = ref('');
const copySshKeyFeedback = ref(false);

const fieldHelp = {
  name: 'A short identifier for your app (e.g. my-app). Used in the app list and on the server.',
  repo_url: 'The Git clone URL in HTTPS or SSH format. Example: https://github.com/user/repo.git',
  branch: 'The ref to deploy: a branch name (e.g. main), a tag (e.g. v1.0.0), or a full commit SHA.',
  suggest: 'Fetches package.json from the repo and suggests install, build, and start commands plus Node version.',
  zip: 'Upload a .zip of your Node.js project. The archive must contain package.json at the root or in a single top-level folder.',
  preset: 'Pre-fill install, build, and start commands for common frameworks (Nuxt, Next.js, Express, Nest.js).',
  node_version: 'The Node.js version to run the app. It must be installed under Node versions first.',
  install_cmd: 'Command to install dependencies (e.g. npm install or yarn install). Run once during deploy.',
  build_cmd: 'Optional. Command to build the app (e.g. npm run build). Leave empty if the app has no build step.',
  start_cmd: 'Command to start the app (e.g. npm start or node server.js). This is run by PM2 to keep the app running.',
  domain: 'Optional. Public hostname for the app (e.g. app.example.com). Point DNS to this server before enabling.',
  ssl_enabled: 'Request a Let\'s Encrypt certificate for the app domain. Requires a domain above and the server reachable on ports 80 and 443.',
};

function onHelpMouseEnter(id) {
  if (!helpPinned.value) openHelpId.value = id;
}
function onHelpMouseLeave() {
  if (!helpPinned.value) openHelpId.value = null;
}
function onHelpClick(id) {
  if (openHelpId.value === id) {
    openHelpId.value = null;
    helpPinned.value = false;
  } else {
    openHelpId.value = id;
    helpPinned.value = true;
  }
}

async function fetchSshPublicKey() {
  sshKeyLoading.value = true;
  sshKeyError.value = '';
  sshPublicKey.value = null;
  try {
    const data = await api.system.sshPublicKey();
    sshPublicKey.value = data.publicKey || null;
    if (data.error) sshKeyError.value = data.error;
  } catch (e) {
    sshKeyError.value = e.message || 'Could not load SSH key';
  } finally {
    sshKeyLoading.value = false;
  }
}

function copySshKey() {
  if (!sshPublicKey.value) return;
  navigator.clipboard.writeText(sshPublicKey.value).then(() => {
    copySshKeyFeedback.value = true;
    setTimeout(() => { copySshKeyFeedback.value = false; }, 2000);
  });
}

watch(repoVisibility, (val) => {
  if (val === 'private') fetchSshPublicKey();
  else {
    sshPublicKey.value = null;
    sshKeyError.value = '';
  }
});

const presets = [
  { id: 'nuxt3', label: 'Nuxt 3', install_cmd: 'npm install', build_cmd: 'npm run build', start_cmd: 'node .output/server/index.mjs', node_version: '20' },
  { id: 'nextjs', label: 'Next.js', install_cmd: 'npm install', build_cmd: 'npm run build', start_cmd: 'npm start', node_version: '20' },
  { id: 'express', label: 'Express', install_cmd: 'npm install', build_cmd: '', start_cmd: 'npm start', node_version: '20' },
  { id: 'nestjs', label: 'Nest.js', install_cmd: 'npm install', build_cmd: 'npm run build', start_cmd: 'npm run start:prod', node_version: '20' },
];

const DEFAULT_FORM = {
  name: '',
  repo_url: '',
  branch: 'main',
  node_version: '20',
  install_cmd: 'npm install',
  build_cmd: '',
  start_cmd: 'npm start',
  domain: '',
  ssl_enabled: false,
};

const form = ref({ ...DEFAULT_FORM });

const sslEnabledOption = computed({
  get: () => form.value.ssl_enabled ? '1' : '0',
  set: (v) => { form.value.ssl_enabled = v === '1'; },
});

function applyPreset() {
  const id = selectedPresetId.value;
  if (!id) {
    form.value.install_cmd = DEFAULT_FORM.install_cmd;
    form.value.build_cmd = DEFAULT_FORM.build_cmd;
    form.value.start_cmd = DEFAULT_FORM.start_cmd;
    form.value.node_version = nodeVersions.value[0] || DEFAULT_FORM.node_version;
    return;
  }
  const p = presets.find((x) => x.id === id);
  if (!p) return;
  form.value.install_cmd = p.install_cmd;
  form.value.build_cmd = p.build_cmd;
  form.value.start_cmd = p.start_cmd;
  if (nodeVersions.value.includes(p.node_version)) {
    form.value.node_version = p.node_version;
  } else {
    form.value.node_version = p.node_version;
  }
  if (!form.value.name?.trim() && form.value.repo_url?.trim()) {
    try {
      const u = new URL(form.value.repo_url);
      const segs = u.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
      if (segs.length) form.value.name = segs[segs.length - 1];
    } catch (_) {}
  }
}

async function suggestFromRepo() {
  const url = (form.value.repo_url || '').trim();
  if (!url) return;
  suggestError.value = '';
  suggestLoading.value = true;
  try {
    const data = await api.apps.suggest({ repo_url: url, ref: form.value.branch?.trim() || undefined });
    if (data.install_cmd != null) form.value.install_cmd = data.install_cmd;
    if (data.build_cmd != null) form.value.build_cmd = data.build_cmd ?? '';
    if (data.start_cmd != null) form.value.start_cmd = data.start_cmd;
    if (data.node_version != null && (nodeVersions.value.length === 0 || nodeVersions.value.includes(data.node_version))) {
      form.value.node_version = data.node_version;
    }
  } catch (e) {
    suggestError.value = e.message || 'Could not fetch package.json';
  } finally {
    suggestLoading.value = false;
  }
}

function onZipSelect(e) {
  const f = e.target.files && e.target.files[0];
  zipFile.value = f || null;
}

function formatSize(bytes) {
  if (bytes == null) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i <= 1 ? 0 : 1)} ${units[i]}`;
}

const loadError = ref('');
const busyId = ref(null);
const showDeleteModal = ref(false);
const appToDelete = ref(null);
const deleting = ref(false);
const deleteError = ref('');

async function load() {
  loadError.value = '';
  try {
    const data = await api.apps.list();
    apps.value = data.apps || [];
  } catch (e) {
    loadError.value = e.message || 'Failed to load apps';
  }
}

async function loadNodeVersions() {
  try {
    const data = await api.node.versions();
    const list = data.versions || [];
    nodeVersions.value = list;
    if (list.length && !list.includes(form.value.node_version)) {
      form.value.node_version = list[0];
    }
  } catch (_) {}
}

function closeForm() {
  showForm.value = false;
  zipFile.value = null;
  domainCheckStatus.value = '';
  domainCheckMessage.value = '';
  branchDetected.value = '';
  suggestError.value = '';
  repoVisibility.value = 'public';
  sshPublicKey.value = null;
  sshKeyError.value = '';
}

async function doStart(app) {
  if (busyId.value) return;
  busyId.value = app.id;
  try {
    await api.apps.start(app.id);
    await load();
  } finally {
    busyId.value = null;
  }
}

async function doStop(app) {
  if (busyId.value) return;
  busyId.value = app.id;
  try {
    await api.apps.stop(app.id);
    await load();
  } finally {
    busyId.value = null;
  }
}

async function doRestart(app) {
  if (busyId.value) return;
  busyId.value = app.id;
  try {
    await api.apps.restart(app.id);
    await load();
  } finally {
    busyId.value = null;
  }
}

function closeDeleteModal() {
  if (deleting.value) return;
  showDeleteModal.value = false;
  appToDelete.value = null;
  deleteError.value = '';
}

function confirmDelete(app) {
  deleteError.value = '';
  appToDelete.value = app;
  showDeleteModal.value = true;
}

async function doDelete() {
  if (!appToDelete.value) return;
  deleteError.value = '';
  deleting.value = true;
  try {
    await api.apps.remove(appToDelete.value.id);
    closeDeleteModal();
    await load();
  } catch (e) {
    deleteError.value = e.message || 'Delete failed';
  } finally {
    deleting.value = false;
  }
}

async function checkDomain() {
  const domain = (form.value.domain || '').trim();
  domainCheckStatus.value = '';
  domainCheckMessage.value = '';
  if (!domain) return;
  domainCheckStatus.value = 'checking';
  try {
    const data = await api.system.checkDomain(domain);
    domainCheckMessage.value = data.message || (data.resolves ? 'Domain resolves' : 'Domain does not resolve');
    if (data.ok && data.resolves) {
      domainCheckStatus.value = data.matches ? 'ok' : 'warn';
    } else {
      domainCheckStatus.value = 'error';
    }
  } catch (e) {
    domainCheckStatus.value = 'error';
    domainCheckMessage.value = e.message || 'Domain check failed';
  }
}

async function fetchDefaultBranchIfEmpty() {
  const url = (form.value.repo_url || '').trim();
  const branch = (form.value.branch || '').trim();
  branchDetected.value = '';
  if (!url || branch) return;
  if (!/^https?:/.test(url)) return;
  try {
    const data = await api.system.defaultBranch(url);
    if (data.branch) {
      form.value.branch = data.branch;
      branchDetected.value = `Default branch: ${data.branch}`;
    }
  } catch (_) {}
}

onMounted(() => {
  load();
  loadNodeVersions();
  document.addEventListener('click', onDocumentClick);
});
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
});
function onDocumentClick(e) {
  if (helpPinned.value && openHelpId.value && !e.target.closest('.help-wrap')) {
    openHelpId.value = null;
    helpPinned.value = false;
  }
}

const stepLabels = {
  clone: 'Cloning repository…',
  clone_done: 'Repository ready',
  extract: 'Extracting zip…',
  extract_done: 'Extract complete',
  install: 'Running install…',
  install_done: 'Install complete',
  build: 'Running build…',
  build_done: 'Build complete',
  nginx: 'Configuring nginx…',
  ssl: 'Obtaining SSL certificate…',
  ssl_done: 'SSL ready',
  nginx_done: 'Nginx configured',
  start: 'Starting app…',
  start_done: 'App started',
};

const stepProgress = {
  clone: 10,
  clone_done: 15,
  extract: 5,
  extract_done: 10,
  install: 25,
  install_done: 35,
  build: 45,
  build_done: 55,
  nginx: 65,
  ssl: 72,
  ssl_done: 78,
  nginx_done: 80,
  start: 90,
  start_done: 100,
};

function appendLogs(logs, stdout, stderr) {
  if (stdout && stdout.trim()) logs.push(stdout.trim());
  if (stderr && stderr.trim()) logs.push(stderr.trim());
}

function handleCreateEvent(ev) {
  if (ev.step) {
    creationStep.value = ev.message || stepLabels[ev.step] || ev.step;
    const p = stepProgress[ev.step];
    if (p != null) creationProgress.value = Math.max(creationProgress.value, p);
    if (ev.stdout || ev.stderr) {
      const lines = creationLogs.value ? creationLogs.value.split('\n') : [];
      appendLogs(lines, ev.stdout, ev.stderr);
      creationLogs.value = lines.join('\n');
      nextTick(() => {
        const el = creationLogsEl.value;
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
    if (ev.sslError) creationLogs.value = (creationLogs.value ? creationLogs.value + '\n' : '') + ev.sslError;
  }
  if (ev.error) createError.value = ev.error;
}

async function create() {
  createError.value = '';
  creationStep.value = 'Starting…';
  creationLogs.value = '';
  creationProgress.value = 0;
  creating.value = true;
  try {
    let result;
    if (sourceType.value === 'zip') {
      if (!zipFile.value) {
        createError.value = 'Please select a .zip file';
        return;
      }
      const fd = new FormData();
      fd.append('zip', zipFile.value);
      fd.append('name', form.value.name);
      fd.append('install_cmd', form.value.install_cmd || 'npm install');
      fd.append('build_cmd', form.value.build_cmd || '');
      fd.append('start_cmd', form.value.start_cmd || 'npm start');
      fd.append('node_version', form.value.node_version || '20');
      fd.append('domain', form.value.domain || '');
      fd.append('ssl_enabled', form.value.ssl_enabled ? '1' : '0');
      result = await api.apps.createFromZipWithProgress(fd, handleCreateEvent);
    } else {
      if (!form.value.repo_url || !form.value.repo_url.trim()) {
        createError.value = 'Repository URL is required';
        return;
      }
      result = await api.apps.createWithProgress(form.value, handleCreateEvent);
    }
    creationSslWarning.value = result.sslWarning || '';
    showForm.value = false;
    form.value = { ...DEFAULT_FORM, node_version: nodeVersions.value[0] || DEFAULT_FORM.node_version };
    selectedPresetId.value = '';
    repoVisibility.value = 'public';
    sshPublicKey.value = null;
    sshKeyError.value = '';
    suggestError.value = '';
    zipFile.value = null;
    domainCheckStatus.value = '';
    domainCheckMessage.value = '';
    branchDetected.value = '';
    load();
    creationDone.value = true;
  } catch (e) {
    createError.value = e.message || 'Create failed';
    creationDone.value = true;
  } finally {
    creating.value = false;
  }
}

function closeCreationOverlay() {
  creationDone.value = false;
  creationStep.value = '';
  creationLogs.value = '';
  creationProgress.value = 0;
  createError.value = '';
  creationSslWarning.value = '';
}
</script>

<style scoped>
.source-type-tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
}
.source-type-tab {
  padding: 0.4rem 0.75rem;
  font-size: 0.875rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text-muted);
  cursor: pointer;
}
.source-type-tab:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.source-type-tab.active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(99, 102, 241, 0.1);
}
.repo-visibility-options {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
.repo-visibility-options .radio-label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  font-weight: normal;
}
.private-repo-info__box {
  padding: 1rem;
  border-radius: var(--radius);
  background: var(--bg-hover);
  border: 1px solid var(--border);
}
.private-repo-info__title {
  margin: 0 0 0.5rem;
  font-weight: 600;
  font-size: 0.9375rem;
}
.private-repo-info__list {
  margin: 0 0 0.75rem;
  padding-left: 1.25rem;
}
.private-repo-info__list li {
  margin-bottom: 0.5rem;
}
.private-repo-info__list code {
  font-size: 0.8125rem;
  padding: 0.15rem 0.35rem;
  border-radius: 3px;
  background: var(--bg);
}
.private-repo-info__note {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-muted);
}
.form-hint {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
  color: var(--text-muted);
}
.field-with-help {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.field-with-help input:not([type="file"]),
.field-with-help select {
  flex: 1;
  min-width: 0;
}
.field-with-help.suggest-field {
  align-items: flex-start;
}
.field-with-help.suggest-field .suggest-row {
  flex: 1;
  min-width: 0;
}
.help-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  margin-left: 0.25rem;
  vertical-align: middle;
}
.help-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--bg);
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}
.help-trigger:hover {
  color: var(--accent);
  background: rgba(99, 102, 241, 0.15);
}
.help-tooltip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 0.5rem);
  transform: translateX(-50%) scale(0.96);
  min-width: 200px;
  max-width: 280px;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--text);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.15s ease, visibility 0.15s ease, transform 0.15s ease;
  z-index: 50;
}
.help-wrap:hover .help-tooltip,
.help-tooltip.visible {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) scale(1);
}
.help-tooltip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -6px;
  border: 6px solid transparent;
  border-top-color: var(--border);
}
.help-tooltip::before {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  margin-left: -5px;
  border: 5px solid transparent;
  border-top-color: var(--bg-card);
  z-index: 1;
}
.creation-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}
.creation-modal {
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.creation-progress {
  flex: 1;
  min-height: 0;
}
.creation-progress-bar {
  height: 8px;
  background: var(--bg);
  border-radius: 999px;
  overflow: hidden;
  margin-bottom: 0.75rem;
}
.creation-progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 999px;
  transition: width 0.25s ease-out;
}
.creation-step-label {
  margin: 0 0 0.5rem;
  font-size: 0.875rem;
  color: var(--text-muted);
}
.creation-log-label {
  margin: 0 0 0.35rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.creation-done {
  flex: 1;
  min-height: 0;
}
.creation-logs {
  margin: 0;
  padding: 0.75rem;
  background: var(--bg);
  border-radius: var(--radius);
  font-size: 0.8rem;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
.is-disabled {
  opacity: 0.7;
  pointer-events: none;
}
.domain-check {
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
}
.domain-check--checking {
  color: var(--text-muted);
}
.domain-check--ok {
  color: var(--success);
}
.domain-check--warn {
  color: #eab308;
}
.domain-check--error {
  color: var(--danger);
}
.suggest-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.suggest-error {
  font-size: 0.875rem;
  color: var(--danger);
}
.ssl-off {
  color: var(--text-muted);
}
.list-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.list-actions .btn-sm {
  padding: 0.35rem 0.5rem;
  min-width: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}
.confirm-dialog {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
  max-width: 420px;
  width: 100%;
  box-shadow: 0 20px 40px rgba(0,0,0,0.4);
}
.confirm-dialog--danger {
  border-color: var(--danger);
}
.confirm-dialog__icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}
.confirm-dialog__title {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
  font-weight: 600;
}
.confirm-dialog__message {
  margin: 0 0 1rem;
  font-size: 0.9375rem;
  color: var(--text-muted);
  line-height: 1.5;
}
.confirm-dialog__message strong {
  color: var(--text);
}
.confirm-dialog__list {
  margin: 0 0 1.25rem;
  padding-left: 1.25rem;
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.6;
}
.confirm-dialog__error {
  margin: 0 0 1rem;
  font-size: 0.875rem;
  color: var(--danger);
}
.confirm-dialog__actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}
</style>
