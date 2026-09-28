import { crudRoutes } from '@/lib/server/db';
export const dynamic = 'force-dynamic';
const { save } = crudRoutes('bookings');
export const POST = save;
