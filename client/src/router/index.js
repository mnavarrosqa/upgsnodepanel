import { createRouter, createWebHistory } from 'vue-router';
import { api } from '../api';

const routes = [
  { path: '/login', name: 'Login', component: () => import('../views/Login.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('../views/Layout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'Dashboard', component: () => import('../views/Dashboard.vue') },
      { path: 'node', name: 'NodeVersions', component: () => import('../views/NodeVersions.vue') },
      { path: 'apps', name: 'Apps', component: () => import('../views/Apps.vue') },
      { path: 'apps/:id', name: 'AppDetail', component: () => import('../views/AppDetail.vue') },
      { path: 'maintenance', name: 'Maintenance', component: () => import('../views/Maintenance.vue') },
      { path: 'docs', name: 'Documentation', component: () => import('../views/Documentation.vue') },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to, from, next) => {
  const data = await api.auth.me().catch(() => ({ user: null }));
  const loggedIn = !!data.user;
  if (to.meta.public) {
    if (loggedIn) {
      const redirectPath = to.query.redirect && to.query.redirect !== '/login' ? to.query.redirect : '/';
      next({ path: redirectPath, query: {} });
    } else {
      next();
    }
    return;
  }
  if (to.meta.requiresAuth && !loggedIn) {
    next({ name: 'Login', query: { redirect: to.fullPath } });
  } else {
    next();
  }
});

export default router;
