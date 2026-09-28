import { crudRoutes } from '@/lib/server/db';
export const dynamic = 'force-dynamic';
const { save } = crudRoutes('transactions');
export const POST = save;
