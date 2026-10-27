-- A vehicle returned early is free from its actual closing time, not the
-- scheduled end. The old guard used ends_at, so a trip closed early kept
-- blocking the car until its original end date.
-- greatest() keeps the range valid if a closing time predates the start.
alter table public.bookings drop constraint if exists bookings_no_overlap;
alter table public.bookings add constraint bookings_no_overlap
  exclude using gist (
    vehicle_id with =,
    tstzrange(starts_at, greatest(starts_at, coalesce(closing_time, ends_at)), '[)') with &&
  ) where (status in ('ongoing', 'completed'));
