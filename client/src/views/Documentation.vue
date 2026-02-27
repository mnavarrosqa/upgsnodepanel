<template>
  <div class="documentation">
    <h1 class="page-title">Documentation</h1>
    <p class="page-intro">Help for all UPGS Node Panel features. Use the links below to jump to a section.</p>

    <nav class="doc-nav" aria-label="Documentation sections">
      <ul class="doc-nav__list">
        <li v-for="s in sections" :key="s.id">
          <a :href="`#${s.id}`" class="doc-nav__link">{{ s.title }}</a>
        </li>
      </ul>
      <div class="doc-nav__sub">
        <span class="doc-nav__sub-label">Apps</span>
        <ul class="doc-nav__list doc-nav__list--sub">
          <li v-for="s in appSubSections" :key="s.id">
            <a :href="`#${s.id}`" class="doc-nav__link doc-nav__link--sub">{{ s.title }}</a>
          </li>
        </ul>
      </div>
    </nav>

    <section id="overview" class="doc-section card">
      <h2 class="doc-section__title">Overview</h2>
      <p class="doc-section__p">UPGS Node Panel lets you manage and deploy Node.js apps on your VPS. You log in with your server credentials, install Node versions via nvm, add apps from Git or ZIP, and expose each app via nginx with an optional domain and SSL (Let's Encrypt). Apps run under PM2 so they stay up and can be started, stopped, or restarted from the panel.</p>
      <p class="doc-section__p"><strong>Supported:</strong> Ubuntu 20, 22, 24, 25. The installer sets up nginx, git, Node (nvm), PM2, and the panel as a systemd service.</p>
    </section>

    <section id="auth" class="doc-section card">
      <h2 class="doc-section__title">Authentication</h2>
      <p class="doc-section__p">Login uses <strong>PAM</strong> (Pluggable Authentication Modules): you sign in with the same username and password you use for SSH (e.g. the user who runs the panel, or <code>root</code>). No separate panel password.</p>
      <p class="doc-section__p">Session is stored in a cookie. In production, set <code>SESSION_SECRET</code> in the panel's <code>.env</code> to a random string.</p>
    </section>

    <section id="dashboard" class="doc-section card">
      <h2 class="doc-section__title">Dashboard</h2>
      <p class="doc-section__p">The dashboard shows app count, server public IP, and a quick list of all apps with status (running/stopped) and how to reach them (domain or IP:port). Use the server IP to open apps by port when no domain is set.</p>
    </section>

    <section id="node-versions" class="doc-section card">
      <h2 class="doc-section__title">Node versions</h2>
      <p class="doc-section__p">The panel uses <strong>nvm</strong> on the server. From the Node versions page you can:</p>
      <ul class="doc-list">
        <li>Install a specific version (e.g. <code>20</code>, <code>22.1.0</code>) or <code>lts</code>.</li>
        <li>Use quick-install buttons for 18, 20, 22, or LTS.</li>
        <li>See installed versions. Each app can target a different Node version when you add or edit it.</li>
      </ul>
      <p class="doc-section__p">Install a version before adding apps that need it; the panel will run <code>nvm use &lt;version&gt;</code> when running install, build, and start for that app.</p>
    </section>

    <section id="apps" class="doc-section card">
      <h2 class="doc-section__title">Apps</h2>
      <p class="doc-section__p">Apps are Node projects the panel clones or extracts, then runs with your chosen install/build/start commands and a dedicated port. They appear in <code>pm2 list</code> on the server.</p>

      <h3 id="apps-add" class="doc-heading">Adding an app</h3>
      <p class="doc-section__p">Click <strong>Add app</strong>, then choose the source:</p>
      <ul class="doc-list">
        <li><strong>From Git</strong> — Clone from a repository (public or private). You set repository URL, branch/tag/commit, install/build/start commands, and Node version.</li>
        <li><strong>From ZIP</strong> — Upload a <code>.zip</code> of your project. The archive must contain <code>package.json</code> at the root or in a single top-level folder.</li>
      </ul>

      <h4 class="doc-subheading">From Git</h4>
      <ul class="doc-list">
        <li><strong>Repository visibility</strong> — Choose <strong>Public</strong> or <strong>Private</strong>. For private repos you need either a Personal Access Token in the URL or SSH with a deploy key (see Private repositories below).</li>
        <li><strong>Repository URL</strong> — HTTPS (e.g. <code>https://github.com/user/repo.git</code>) or SSH (e.g. <code>git@github.com:user/repo.git</code>).</li>
        <li><strong>Branch, tag, or commit</strong> — A branch name (<code>main</code>, <code>master</code>), a tag (<code>v1.0.0</code>), or a commit SHA. Leave empty to use the default branch; the panel can detect it for many public HTTPS URLs.</li>
        <li><strong>Suggest from repo</strong> — Fetches <code>package.json</code> from the repo and fills install, build, and start commands and Node version from <code>engines.node</code>. Works for public repos; for private repos fill commands manually or use a preset.</li>
        <li><strong>Use preset</strong> — Pre-fill install, build, and start commands for <strong>Nuxt 3</strong>, <strong>Next.js</strong>, <strong>Express</strong>, or <strong>Nest.js</strong>. Choose "None" to reset. If the app name is empty, selecting a preset may suggest a name from the repo URL.</li>
        <li><strong>Node version</strong> — Must be installed under Node versions first. You can type a version to install later.</li>
        <li><strong>Install / Build / Start commands</strong> — Defaults: <code>npm install</code>, empty build, <code>npm start</code>. Edit as needed.</li>
        <li><strong>Domain (optional)</strong> — e.g. <code>app.example.com</code>. The panel can check that the domain resolves and points to this server before you create the app.</li>
        <li><strong>Enable SSL</strong> — Request a Let's Encrypt certificate. Requires a domain and the server reachable on ports 80 and 443.</li>
      </ul>
      <p class="doc-section__p">Each field has a <strong>help icon (?)</strong>; hover or click to see a short description.</p>

      <h4 class="doc-subheading">From ZIP</h4>
      <p class="doc-section__p">Select a <code>.zip</code> file. Enter name, install/build/start commands, Node version, and optional domain and SSL. Presets work the same as for Git.</p>

      <h3 id="apps-private" class="doc-heading">Private repositories</h3>
      <p class="doc-section__p">When you choose <strong>Private</strong> as repository visibility, the form shows how to authenticate:</p>
      <ul class="doc-list">
        <li><strong>HTTPS with token</strong> — Use a Personal Access Token (PAT) in the URL: <code>https://YOUR_TOKEN@github.com/user/repo.git</code>. Create a PAT with repo scope in GitHub (Settings → Developer settings) or GitLab (Preferences → Access Tokens). Do not share your token.</li>
        <li><strong>SSH</strong> — Use an SSH URL: <code>git@github.com:user/repo.git</code>. Add the server's SSH public key as a deploy key in the repository (GitHub: Settings → Deploy keys; GitLab: Settings → Repository → Deploy keys).</li>
      </ul>
      <p class="doc-section__p">The panel can show the <strong>server's SSH public key</strong> so you can copy it and add it as a deploy key. If no key exists, you can <strong>Generate SSH key</strong> on the server, then add the new key to the repo.</p>

      <h3 id="apps-creation" class="doc-heading">Creation progress</h3>
      <p class="doc-section__p">After you click <strong>Create app</strong>, a modal shows progress: clone/extract, install, build, nginx config, SSL (if enabled), and start. A live log shows command output. When done, you see "App created" or any error; if SSL failed, a warning is shown but the app is still created.</p>

      <h3 id="apps-list" class="doc-heading">App list actions</h3>
      <p class="doc-section__p">In the apps table you can:</p>
      <ul class="doc-list">
        <li><strong>Open</strong> — Go to the app detail page.</li>
        <li><strong>Run</strong> — Start the app (PM2).</li>
        <li><strong>Pause</strong> — Stop the app.</li>
        <li><strong>Restart</strong> — Restart the app.</li>
        <li><strong>Delete</strong> — Permanently remove the app (PM2, nginx config, panel record, and app folder on disk). You will be asked to confirm.</li>
      </ul>
    </section>

    <section id="app-detail" class="doc-section card">
      <h2 class="doc-section__title">App detail</h2>
      <p class="doc-section__p">Open an app from the list to see its detail page. The page has <strong>tabs</strong>: Overview, App config, File explorer, Env, Logs. A dot (•) on a tab means you have unsaved changes; if you switch tabs with unsaved changes, you will be prompted to save or discard.</p>
      <p class="doc-section__p">Header actions: <strong>Run</strong>, <strong>Pause</strong>, <strong>Restart</strong>, <strong>Delete</strong> (same as in the app list; Delete asks for confirmation and lists what will be removed).</p>

      <h3 id="app-detail-overview" class="doc-heading">Overview tab</h3>
      <ul class="doc-list">
        <li><strong>Access</strong> — Domain URL (with SSL or "SSL pending" if enabled) and direct <strong>IP:port</strong> link. If no domain is set, a note suggests setting one in App config.</li>
        <li><strong>Size</strong> — Disk space used by the app directory (source, dependencies, build output). Shown in human-readable form and in bytes. Shown as "—" until the app directory exists.</li>
      </ul>

      <h3 id="app-detail-config" class="doc-heading">App config tab</h3>
      <p class="doc-section__p">Edit domain, SSL, branch/tag/commit (for Git apps), Node version, and install/build/start commands. Click <strong>Save</strong> to apply.</p>
      <p class="doc-section__p">For Git apps (not upload-from-ZIP):</p>
      <ul class="doc-list">
        <li><strong>Update from repo</strong> — Runs <code>git fetch</code> and <code>git checkout</code> (and <code>git pull</code> when on a branch). Save first if you changed the branch.</li>
        <li><strong>Redeploy</strong> — Update from repo, then install, build, and restart. Use this for a full redeploy.</li>
      </ul>
      <p class="doc-section__p">For all apps:</p>
      <ul class="doc-list">
        <li><strong>Run install</strong> — Run the install command in the app directory.</li>
        <li><strong>Run build</strong> — Run the build command. Use after changing commands or for a clean build.</li>
      </ul>

      <h3 id="app-detail-files" class="doc-heading">File explorer tab</h3>
      <p class="doc-section__p">Browse and manage files in the app's directory. Handy for quick config changes without SSH.</p>
      <ul class="doc-list">
        <li><strong>Breadcrumb</strong> — Navigate by clicking "App root" or folder names in the path.</li>
        <li><strong>New file</strong> / <strong>New folder</strong> — Create a file or folder in the current directory. For files you can optionally set initial content.</li>
        <li><strong>Refresh</strong> — Reload the current directory listing.</li>
        <li><strong>View</strong> — Open a text file in read-only mode (files under 512 KB).</li>
        <li><strong>Edit</strong> — Open a text file for editing and save changes.</li>
        <li><strong>Delete</strong> — Remove a file or folder (with confirmation; deleting a folder removes all contents).</li>
      </ul>
      <p class="doc-section__p">If the app directory does not exist yet (e.g. before first deploy), the file explorer shows a message to create or deploy the app first.</p>

      <h3 id="app-detail-env" class="doc-heading">Env tab</h3>
      <p class="doc-section__p">View and edit the app's <code>.env</code> file. Use <strong>Save .env</strong> to write changes and <strong>Reload</strong> to re-read from disk. Restart the app for env changes to take effect.</p>

      <h3 id="app-detail-logs" class="doc-heading">Logs tab</h3>
      <p class="doc-section__p">Shows PM2 output (stdout and stderr) for the app. Use <strong>Copy</strong> to copy logs to the clipboard and <strong>Refresh</strong> to load the latest output.</p>
    </section>

    <section id="maintenance" class="doc-section card">
      <h2 class="doc-section__title">Maintenance</h2>
      <p class="doc-section__p">The Maintenance page lists cleanup options (e.g. npm cache, old build artifacts) with total size. You can run each cleanup individually or <strong>Clean all</strong>. Each action only removes files not required for your apps; it can free disk space.</p>
    </section>

    <section id="installer" class="doc-section card">
      <h2 class="doc-section__title">Installer and updates</h2>
      <p class="doc-section__p">On a fresh Ubuntu 20–25 server (as root or with sudo), run the installer from the repo or via one-liner. When you run <code>sudo ./install.sh</code>, the panel runs as your user and you log in with that username; when run as root, it runs as root. The installer sets up system dependencies, nvm, Node LTS, PM2, the panel, systemd unit, nginx config for the panel, and optionally certbot; it also opens firewall ports for SSH, HTTP, HTTPS, and the app port range. Nginx reload and certbot are allowed via sudo for the panel user when not root.</p>
      <p class="doc-section__p">To update the panel: run <code>./update.sh</code> from the install directory (or the one-liner from the README). Your <code>.env</code> is preserved; the script pulls the repo, runs <code>npm install</code> and client build, then restarts the panel service.</p>
    </section>
  </div>
</template>

<script setup>
const sections = [
  { id: 'overview', title: 'Overview' },
  { id: 'auth', title: 'Authentication' },
  { id: 'dashboard', title: 'Dashboard' },
  { id: 'node-versions', title: 'Node versions' },
  { id: 'apps', title: 'Apps' },
  { id: 'app-detail', title: 'App detail' },
  { id: 'maintenance', title: 'Maintenance' },
  { id: 'installer', title: 'Installer and updates' },
];

const appSubSections = [
  { id: 'apps-add', title: 'Adding an app' },
  { id: 'apps-private', title: 'Private repositories' },
  { id: 'apps-creation', title: 'Creation progress' },
  { id: 'apps-list', title: 'App list actions' },
];
</script>

<style scoped>
.documentation {
  max-width: 52rem;
}
.page-intro {
  color: var(--text-muted);
  margin: 0 0 1.5rem;
  font-size: 0.9375rem;
  line-height: 1.5;
}
.doc-nav {
  margin-bottom: 2rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--border);
}
.doc-nav__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
}
.doc-nav__list--sub {
  margin-top: 0.35rem;
}
.doc-nav__link {
  color: var(--accent);
  text-decoration: none;
  font-size: 0.9375rem;
}
.doc-nav__link:hover {
  text-decoration: underline;
}
.doc-nav__link--sub {
  font-size: 0.875rem;
  color: var(--text-muted);
}
.doc-nav__link--sub:hover {
  color: var(--accent);
}
.doc-nav__sub {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}
.doc-nav__sub-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  display: block;
  margin-bottom: 0.35rem;
}
.doc-section {
  margin-bottom: 1.5rem;
}
.doc-section__title,
.doc-section .card__title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
  color: var(--text);
}
.doc-section__p,
.doc-section .card__muted {
  font-size: 0.9375rem;
  margin-bottom: 0.75rem;
  line-height: 1.55;
  color: var(--text-muted);
}
.doc-section__p:last-child,
.doc-section .card__muted:last-child {
  margin-bottom: 0;
}
.doc-heading {
  font-size: 1rem;
  font-weight: 600;
  margin: 1.5rem 0 0.5rem;
  color: var(--text);
  padding-top: 0.25rem;
}
.doc-heading:first-child {
  margin-top: 0;
}
.doc-subheading {
  font-size: 0.9375rem;
  font-weight: 600;
  margin: 1rem 0 0.35rem;
  color: var(--text);
}
.doc-list {
  margin: 0.5rem 0 0.75rem 1.25rem;
  padding: 0;
  font-size: 0.9375rem;
  color: var(--text-muted);
  line-height: 1.55;
}
.doc-list li {
  margin-bottom: 0.4rem;
}
.doc-list li:last-child {
  margin-bottom: 0;
}
.doc-section code {
  font-size: 0.875em;
  padding: 0.15rem 0.35rem;
  background: var(--bg);
  border-radius: var(--radius);
  color: var(--text);
}
</style>
