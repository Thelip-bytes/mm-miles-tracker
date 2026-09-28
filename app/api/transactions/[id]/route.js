import { crudRoutes } from '@/lib/server/db';
export const dynamic = 'force-dynamic';
const { remove } = crudRoutes('transactions');
export const DELETE = remove;
