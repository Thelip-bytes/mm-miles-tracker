-- bookings_no_overlap frees a car at coalesce(closing_time, ends_at), so a
-- trip past its end that was never completed (no closing time, or a closing
-- time but no end km) still let a second booking start on the car. An
-- exclusion constraint can't depend on now(), so this trigger refuses a new
-- active booking while an earlier one on the same car is still 'ongoing'
-- after its scheduled end.
-- Edits that keep the vehicle and dates (e.g. closing the later trip) are
-- left alone, as are completed/cancelled rows (imported history).
create or replace function public.trg_bookings_vehicle_returned()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_open public.bookings;
  v_reg text;
begin
  if new.status <> 'ongoing' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'ongoing'
     and new.vehicle_id is not distinct from old.vehicle_id
     and new.starts_at is not distinct from old.starts_at
     and new.ends_at is not distinct from old.ends_at then
    return new;
  end if;
  select * into v_open
    from public.bookings b
   where b.vehicle_id = new.vehicle_id
     and b.id is distinct from new.id
     and b.status = 'ongoing'
     and b.ends_at <= now()
     and b.starts_at < new.ends_at
   order by b.starts_at
   limit 1;
  if found then
    select reg_number into v_reg from public.vehicles where id = new.vehicle_id;
    raise exception 'VEHICLE_NOT_RETURNED: Booking % on % is past its end time but not completed. Record its closing time and end km first, or pick another vehicle.',
      v_open.code, coalesce(v_reg, 'this vehicle')
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_bookings_vehicle_returned on public.bookings;
create trigger trg_bookings_vehicle_returned
  before insert or update of vehicle_id, starts_at, ends_at, status on public.bookings
  for each row execute function public.trg_bookings_vehicle_returned();
