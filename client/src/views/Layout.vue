<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="sidebar-brand">UPGS NODE PANEL</div>
      <nav class="sidebar-nav">
        <router-link to="/" class="sidebar-nav__item">
          <span class="sidebar-nav__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </span>
          Dashboard
        </router-link>
        <router-link to="/node" class="sidebar-nav__item">
          <span class="sidebar-nav__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/></svg>
          </span>
          Node versions
        </router-link>
        <router-link to="/apps" class="sidebar-nav__item">
          <span class="sidebar-nav__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h.01M10 12h.01M14 12h.01M18 12h.01"/></svg>
          </span>
          Apps
        </router-link>
        <section class="sidebar-section sidebar-section--activity" aria-label="Recent app activity">
          <h3 class="sidebar-section__title">Activity</h3>
          <p v-if="activityError" class="sidebar-section__error">{{ activityError }}</p>
          <p v-else-if="!activity.length" class="sidebar-section__empty">No recent app activity.</p>
          <ul v-else class="activity-list">
            <li v-for="item in activity" :key="item.id" class="activity-item">
              <span class="activity-item__icon" aria-hidden="true">
                <svg v-if="item.action === 'created'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                <svg v-else-if="item.action === 'deleted'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                <svg v-else-if="item.action === 'restarted'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
                <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
              </span>
              <div class="activity-item__body">
                <div class="activity-item__text">{{ formatActivityText(item) }}</div>
                <time class="activity-item__time" :datetime="item.created_at">{{ formatActivityTime(item.created_at) }}</time>
              </div>
            </li>
          </ul>
        </section>
        <router-link to="/maintenance" class="sidebar-nav__item">
          <span class="sidebar-nav__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          </span>
          Maintenance
        </router-link>
        <router-link to="/docs" class="sidebar-nav__item">
          <span class="sidebar-nav__icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
          </span>
          Documentation
        </router-link>
      </nav>
      <div class="sidebar-footer">
        <span class="sidebar-user">{{ user }}</span>
        <button type="button" class="btn" @click="logout">Log out</button>
      </div>
    </aside>
    <main class="main">
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';

const router = useRouter();
const user = ref('');
const activity = ref([]);
const activityError = ref('');
let activityTimer;

onMounted(async () => {
  try {
    const data = await api.auth.me();
    user.value = data.user || '';
  } catch (_) {}

  await loadActivity();
  activityTimer = window.setInterval(loadActivity, 15000);
});

onUnmounted(() => {
  if (activityTimer) {
    window.clearInterval(activityTimer);
    activityTimer = undefined;
  }
});

async function loadActivity() {
  try {
    activityError.value = '';
    const data = await api.system.activity(10);
    activity.value = Array.isArray(data.events) ? data.events : [];
  } catch (e) {
    activityError.value = e instanceof Error ? e.message : 'Failed to load activity';
  }
}

function formatActivityText(item) {
  const name = item.app_name || 'App';
  if (item.action === 'created') return `Created ${name}`;
  if (item.action === 'deleted') return `Deleted ${name}`;
  if (item.action === 'started') return `Started ${name}`;
  if (item.action === 'stopped') return `Stopped ${name}`;
  if (item.action === 'restarted') return `Restarted ${name}`;
  return `${name}: ${item.action}`;
}

function formatActivityTime(value) {
  if (!value) return '';
  const iso = value.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

async function logout() {
  await api.auth.logout();
  router.push('/login');
}
</script>

<style scoped>
.sidebar-nav__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.sidebar-nav__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.85;
}
a.router-link-active .sidebar-nav__icon {
  opacity: 1;
}
.sidebar-footer {
  margin-top: auto;
  padding: 1rem;
  border-top: 1px solid var(--border);
}
.sidebar-user {
  display: block;
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}
.sidebar .btn {
  width: 100%;
  justify-content: center;
}

.sidebar-section {
  margin: 1rem 1.25rem;
  padding: 0.75rem 0.5rem 0.75rem 0.75rem;
  border-radius: var(--radius);
  background: rgba(15, 23, 42, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.4);
}

.sidebar-section__title {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.sidebar-section__empty,
.sidebar-section__error {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.sidebar-section__error {
  color: var(--danger);
}

.activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.activity-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.activity-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.9);
  color: var(--accent);
  flex-shrink: 0;
}

.activity-item__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.activity-item__text {
  font-size: 0.8rem;
  color: var(--text);
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.activity-item__time {
  font-size: 0.7rem;
  color: var(--text-muted);
}
</style>
