import { crudRoutes } from '@/lib/server/db';
export const dynamic = 'force-dynamic';
const { save } = crudRoutes('vehicles');
export const POST = save;
