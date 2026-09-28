import { crudRoutes } from '@/lib/server/db';
export const dynamic = 'force-dynamic';
const { remove } = crudRoutes('bookings');
export const DELETE = remove;
