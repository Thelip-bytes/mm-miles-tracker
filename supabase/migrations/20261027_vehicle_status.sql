-- Manual vehicle availability: a car can be taken off the road for
-- maintenance or paused. Live/Idle stay derived from bookings; this is the
-- state a person sets by hand.
alter table public.vehicles
  add column if not exists status text not null default 'available'
    check (status in ('available', 'maintenance', 'paused')),
  add column if not exists status_note text;

-- Managers can't write to vehicles (vehicles_admin_write is admin-only), but
-- they may change a car's status. This function changes only status and its
-- note, so it doesn't widen what managers can touch on the row.
create or replace function public.set_vehicle_status(p_vehicle_id uuid, p_status text, p_note text)
returns public.vehicles
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.vehicles;
begin
  if public.current_role() is null or public.current_role() not in ('admin', 'manager') then
    raise exception 'Only an admin or manager can change a vehicle''s status.' using errcode = '42501';
  end if;
  update public.vehicles
     set status = p_status,
         status_note = case when p_status = 'available' then null else nullif(trim(p_note), '') end
   where id = p_vehicle_id
  returning * into v_row;
  if not found then
    raise exception 'Vehicle not found.' using errcode = 'P0002';
  end if;
  return v_row;
end $$;

revoke all on function public.set_vehicle_status(uuid, text, text) from public;
grant execute on function public.set_vehicle_status(uuid, text, text) to authenticated;

-- A car under maintenance or paused can't take a new active booking, and an
-- active booking can't be moved onto one. Closing or editing a trip that is
-- already running on the car is unaffected, and imported history
-- (completed/cancelled rows) still loads.
create or replace function public.trg_bookings_vehicle_available()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_vehicle public.vehicles;
begin
  if new.status <> 'ongoing' then return new; end if;
  if tg_op = 'UPDATE' and new.vehicle_id is not distinct from old.vehicle_id and old.status = 'ongoing' then
    return new;
  end if;
  select * into v_vehicle from public.vehicles where id = new.vehicle_id;
  if found and v_vehicle.status <> 'available' then
    raise exception 'VEHICLE_UNAVAILABLE: % is % % Set it back to Available on the Vehicles page before booking it.',
      v_vehicle.reg_number,
      case v_vehicle.status when 'maintenance' then 'under maintenance' else 'paused' end,
      case when v_vehicle.status_note is not null then '(' || v_vehicle.status_note || ').' else '.' end
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists trg_bookings_vehicle_available on public.bookings;
create trigger trg_bookings_vehicle_available
  before insert or update of vehicle_id, status on public.bookings
  for each row execute function public.trg_bookings_vehicle_available();
