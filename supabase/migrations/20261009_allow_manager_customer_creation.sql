-- Managers can create a customer while making a booking. They still cannot
-- edit or delete customer records; those actions remain admin-only.
CREATE POLICY customers_manager_insert
  ON public.customers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_role() = 'manager');
