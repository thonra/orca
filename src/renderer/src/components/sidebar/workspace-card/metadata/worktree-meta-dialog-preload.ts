import { lazyWithPreload } from '@/app-shell/startup/lazy-with-retry'

export const WorktreeMetaDialog = lazyWithPreload(() => import('./WorktreeMetaDialog'))
