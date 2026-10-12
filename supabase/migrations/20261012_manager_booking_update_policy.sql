-- Allow managers to update completed bookings (e.g. to fill closing odometer or notes),
-- while still strictly restricting cancelled and no-show statuses to admins only.
DROP POLICY IF EXISTS bookings_manager_update ON public.bookings;
CREATE POLICY bookings_manager_update
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (public.current_role() = 'manager' AND status IN ('ongoing', 'completed'))
  WITH CHECK (public.current_role() = 'manager' AND status IN ('ongoing', 'completed'));
