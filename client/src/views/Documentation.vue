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
    </nav>

    <section id="overview" class="doc-section card">
      <h2 class="card__title">Overview</h2>
      <p class="card__muted">UPGS Node Panel lets you manage and deploy Node.js apps on your VPS. You log in with your server credentials, install Node versions via nvm, add apps from Git or ZIP, and expose each app via nginx with an optional domain and SSL (Let's Encrypt). Apps run under PM2 so they stay up and can be restarted from the panel.</p>
      <p class="card__muted">Supported: <strong>Ubuntu 20, 22, 24, 25</strong>. The installer sets up nginx, git, Node (nvm), PM2, and the panel as a systemd service.</p>
    </section>

    <section id="auth" class="doc-section card">
      <h2 class="card__title">Authentication</h2>
      <p class="card__muted">Login uses <strong>PAM</strong> (Pluggable Authentication Modules): you sign in with the same username and password you use for SSH (e.g. the user who runs the panel, or <code>root</code>). No separate panel password. Session is stored in a cookie; set <code>SESSION_SECRET</code> in <code>.env</code> to a random string in production.</p>
    </section>

    <section id="dashboard" class="doc-section card">
      <h2 class="card__title">Dashboard</h2>
      <p class="card__muted">The dashboard shows app count, server public IP, and a quick list of all apps with status (running/stopped) and how to reach them (domain or IP:port). Use the server IP to open apps by port when no domain is set.</p>
    </section>

    <section id="node-versions" class="doc-section card">
      <h2 class="card__title">Node versions</h2>
      <p class="card__muted">The panel uses <strong>nvm</strong> on the server. From the Node versions page you can:</p>
      <ul class="doc-list">
        <li>Install a specific version (e.g. <code>20</code>, <code>22.1.0</code>) or <code>lts</code>.</li>
        <li>Use quick-install buttons for 18, 20, 22, or LTS.</li>
        <li>See installed versions. Each app can target a different Node version when you add or edit it.</li>
      </ul>
      <p class="card__muted">Install a version before adding apps that need it; the panel will run <code>nvm use &lt;version&gt;</code> when running install, build, and start for that app.</p>
    </section>

    <section id="apps" class="doc-section card">
      <h2 class="card__title">Apps</h2>
      <p class="card__muted">Apps are Node projects the panel clones or extracts, then runs with your chosen install/build/start commands and a dedicated port. They appear in <code>pm2 list</code> on the server.</p>

      <h3 class="doc-heading">Adding an app</h3>
      <p class="card__muted">Click <strong>Add app</strong> and choose:</p>
      <ul class="doc-list">
        <li><strong>From Git</strong> — Repository URL (HTTPS), optional branch/tag/commit, then install/build/start commands and Node version.</li>
        <li><strong>From ZIP</strong> — Upload a .zip of your project (root or single root folder must contain <code>package.json</code>).</li>
      </ul>

      <h3 class="doc-heading">Presets</h3>
      <p class="card__muted">Use the <strong>Use preset</strong> dropdown to fill install, build, and start commands and Node version for common stacks: <strong>Nuxt 3</strong>, <strong>Next.js</strong>, <strong>Express</strong>, <strong>Nest.js</strong>. Choose &quot;None&quot; to reset to defaults. If the app name is empty, selecting a preset can suggest a name from the repo URL.</p>

      <h3 class="doc-heading">Suggest from repo</h3>
      <p class="card__muted">When adding from Git, enter the repository URL (and optionally branch/tag), then click <strong>Suggest from repo</strong>. The panel fetches <code>package.json</code> from GitHub or GitLab and fills install command, build command (if <code>scripts.build</code> exists), start command, and Node version from <code>engines.node</code>. You can edit the suggested values before creating the app.</p>

      <h3 class="doc-heading">Branch, tag, or commit</h3>
      <p class="card__muted">The <strong>Branch, tag, or commit</strong> field accepts:</p>
      <ul class="doc-list">
        <li>A branch name (e.g. <code>main</code>, <code>master</code>).</li>
        <li>A tag (e.g. <code>v1.0.0</code>).</li>
        <li>A commit SHA (7–40 hex characters).</li>
      </ul>
      <p class="card__muted">Leave it empty to use the repository’s default branch. For tags and commits, &quot;Update from repo&quot; and redeploy re-checkout that ref without running <code>git pull</code>.</p>

      <h3 class="doc-heading">Commands and Node version</h3>
      <p class="card__muted">Set <strong>Install command</strong> (default <code>npm install</code>), optional <strong>Build command</strong> (e.g. <code>npm run build</code>), and <strong>Start command</strong> (default <code>npm start</code>). Choose the <strong>Node version</strong> that matches your project (must be installed under Node versions).</p>

      <h3 class="doc-heading">Domain and SSL</h3>
      <p class="card__muted">Optionally set a <strong>Domain</strong> (e.g. <code>app.example.com</code>). The panel writes an nginx vhost so the app is served at that hostname. Enable <strong>SSL</strong> to request a Let’s Encrypt certificate; the domain must point to this server and port 80 must be reachable. You can also access any app by <strong>Server IP:port</strong> without a domain.</p>

      <h3 class="doc-heading">Run, Pause, Restart, Delete</h3>
      <p class="card__muted">From the app list or the app detail page you can start (run), stop (pause), or restart the app via PM2. <strong>Delete</strong> removes the app from PM2, removes its nginx config, deletes the app record and the app directory on disk.</p>

      <h3 class="doc-heading">App detail: Config tab</h3>
      <p class="card__muted">Edit domain, SSL, branch/tag/commit, Node version, and install/build/start commands. <strong>Update from repo</strong> runs <code>git fetch</code> and <code>git checkout</code> (and <code>git pull</code> when on a branch). <strong>Redeploy</strong> does update-from-repo plus install, build, and restart. You can also run <strong>Run install</strong> or <strong>Run build</strong> manually.</p>

      <h3 class="doc-heading">Environment (.env)</h3>
      <p class="card__muted">In the app detail, open the <strong>Env</strong> tab to view or edit the app’s <code>.env</code> file. Restart the app after changing env for the new values to take effect.</p>

      <h3 class="doc-heading">Logs</h3>
      <p class="card__muted">The <strong>Logs</strong> tab shows PM2 output for the app (stdout and stderr). Useful for debugging after start or restart.</p>

      <h3 class="doc-heading">File explorer</h3>
      <p class="card__muted">The <strong>Files</strong> tab lets you browse the app directory, view file contents, and optionally edit or create files. Handy for quick config changes without SSH.</p>
    </section>

    <section id="maintenance" class="doc-section card">
      <h2 class="card__title">Maintenance</h2>
      <p class="card__muted">The Maintenance page lists cleanup options (e.g. npm cache, old build artifacts) with total size. You can run each cleanup individually or <strong>Clean all</strong>. Each action is safe and only removes files not required for your apps to run; it can free disk space.</p>
    </section>

    <section id="installer" class="doc-section card">
      <h2 class="card__title">Installer and updates</h2>
      <p class="card__muted">On a fresh Ubuntu 20–25 server (as root or with sudo), run the installer from the repo or via one-liner. When you run <code>sudo ./install.sh</code>, the panel runs as your user and you log in with that username; when run as root, it runs as root. The installer sets up system dependencies, nvm, Node LTS, PM2, the panel, systemd unit, nginx config for the panel, and optionally certbot; it also opens firewall ports for SSH, HTTP, HTTPS, and the app port range. Nginx reload and certbot are allowed via sudo for the panel user when not root.</p>
      <p class="card__muted">To update the panel to the latest code: run <code>./update.sh</code> from the install directory (or the one-liner from the README). Your <code>.env</code> is preserved; the script pulls the repo, runs <code>npm install</code> and client build, then restarts the panel service.</p>
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
  { id: 'maintenance', title: 'Maintenance' },
  { id: 'installer', title: 'Installer and updates' },
];
</script>

<style scoped>
.documentation {
  max-width: 52rem;
}
.page-intro {
  color: var(--text-muted);
  margin: 0 0 1.5rem;
}
.doc-nav {
  margin-bottom: 2rem;
}
.doc-nav__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
}
.doc-nav__link {
  color: var(--accent);
  text-decoration: none;
  font-size: 0.9375rem;
}
.doc-nav__link:hover {
  text-decoration: underline;
}
.doc-section {
  margin-bottom: 1.5rem;
}
.doc-section .card__title {
  font-size: 1.125rem;
  margin-bottom: 0.25rem;
}
.doc-section .card__muted {
  font-size: 0.9375rem;
  margin-bottom: 0.75rem;
  line-height: 1.55;
}
.doc-section .card__muted:last-child {
  margin-bottom: 0;
}
.doc-heading {
  font-size: 1rem;
  font-weight: 600;
  margin: 1.25rem 0 0.5rem;
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
  margin-bottom: 0.35rem;
}
.doc-section code {
  font-size: 0.875em;
  padding: 0.15rem 0.35rem;
  background: var(--bg);
  border-radius: var(--radius);
  color: var(--text);
}
</style>
