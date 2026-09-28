import { crudRoutes } from '@/lib/server/db';
export const dynamic = 'force-dynamic';
const { remove } = crudRoutes('customers');
export const DELETE = remove;
