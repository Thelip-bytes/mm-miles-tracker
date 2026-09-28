import { crudRoutes } from '@/lib/server/db';
export const dynamic = 'force-dynamic';
const { remove } = crudRoutes('hosts');
export const DELETE = remove;
