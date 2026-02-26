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
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to, from, next) => {
  if (to.meta.public) return next();
  try {
    await api.auth.me();
    next();
  } catch {
    if (to.meta.requiresAuth) next({ name: 'Login', query: { redirect: to.fullPath } });
    else next();
  }
});

export default router;
