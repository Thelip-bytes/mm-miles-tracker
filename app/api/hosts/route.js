import { crudRoutes } from '@/lib/server/db';
export const dynamic = 'force-dynamic';
const { save } = crudRoutes('hosts');
export const POST = save;
