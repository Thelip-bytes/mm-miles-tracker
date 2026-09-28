import { crudRoutes } from '@/lib/server/db';
export const dynamic = 'force-dynamic';
const { save } = crudRoutes('customers');
export const POST = save;
