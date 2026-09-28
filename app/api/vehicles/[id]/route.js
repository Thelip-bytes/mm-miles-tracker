import { crudRoutes } from '@/lib/server/db';
export const dynamic = 'force-dynamic';
const { remove } = crudRoutes('vehicles');
export const DELETE = remove;
