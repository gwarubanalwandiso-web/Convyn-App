-- Carry genuine experience/review evidence across the retained account history.
CREATE FUNCTION marketplace.refresh_provider_history(actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace,public AS $$
DECLARE profile uuid; completed integer; reviews integer; average_rating numeric; reliable integer;
BEGIN
 SELECT id INTO profile FROM marketplace."ProviderProfile" WHERE created_by_id=actor;
 IF profile IS NULL THEN RETURN; END IF;
 SELECT count(*),coalesce(round(avg(rating),2),0) INTO reviews,average_rating FROM (
  SELECT rating FROM marketplace."Review" WHERE provider_profile_id=profile
  UNION ALL SELECT r.rating FROM public."Review" r JOIN public."Booking" b ON b.id=r."bookingId" JOIN public."Bid" q ON q.id=b."bidId" JOIN public."ProviderProfile" p ON p.id=q."providerId" WHERE p."userId"=actor
 ) all_reviews;
 SELECT count(*) INTO completed FROM (
  SELECT id FROM marketplace."Booking" WHERE provider_profile_id=profile AND status='closed'
  UNION ALL SELECT b.id FROM public."Booking" b JOIN public."Bid" q ON q.id=b."bidId" JOIN public."ProviderProfile" p ON p.id=q."providerId" WHERE p."userId"=actor AND b.status='COMPLETED'
 ) all_jobs;
 SELECT coalesce(round(100.0*count(*) FILTER(WHERE arrived<=started+make_interval(mins=>eta))/nullif(count(*),0)),0) INTO reliable FROM (
  SELECT (SELECT min((e->>'at')::timestamptz) FROM jsonb_array_elements(b.timeline) e WHERE e->>'status'='arrived') arrived,b.created_date started,q.eta_minutes eta FROM marketplace."Booking" b JOIN marketplace."Bid" q ON q.id=b.bid_id WHERE b.provider_profile_id=profile AND b.status='closed'
  UNION ALL SELECT (SELECT min(e."createdAt") FROM public."BookingEvent" e WHERE e."bookingId"=b.id AND e.status='ARRIVED'),b."createdAt",q."arrivalMinutes" FROM public."Booking" b JOIN public."Bid" q ON q.id=b."bidId" JOIN public."ProviderProfile" p ON p.id=q."providerId" WHERE p."userId"=actor AND b.status='COMPLETED'
 ) arrivals WHERE arrived IS NOT NULL;
 UPDATE marketplace."ProviderProfile" SET jobs_completed=completed,reviews_count=reviews,rating_avg=average_rating,on_time_rate=reliable WHERE id=profile AND (jobs_completed,reviews_count,rating_avg,on_time_rate) IS DISTINCT FROM (completed,reviews,average_rating,reliable);
END $$;
CREATE FUNCTION marketplace.sync_provider_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace,public AS $$
DECLARE rowj jsonb; actor uuid; job uuid;
BEGIN
 rowj=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 IF TG_TABLE_SCHEMA='marketplace' THEN
  IF TG_TABLE_NAME='ProviderProfile' THEN actor=(rowj->>'created_by_id')::uuid;
  ELSE SELECT created_by_id INTO actor FROM marketplace."ProviderProfile" WHERE id=(rowj->>'provider_profile_id')::uuid; END IF;
 ELSE
  IF TG_TABLE_NAME='Booking' THEN SELECT p."userId" INTO actor FROM public."Bid" q JOIN public."ProviderProfile" p ON p.id=q."providerId" WHERE q.id=(rowj->>'bidId')::uuid;
  ELSE SELECT p."userId" INTO actor FROM public."Booking" b JOIN public."Bid" q ON q.id=b."bidId" JOIN public."ProviderProfile" p ON p.id=q."providerId" WHERE b.id=(rowj->>'bookingId')::uuid; END IF;
 END IF;
 IF actor IS NOT NULL THEN PERFORM marketplace.refresh_provider_history(actor); END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER sync_provider_history AFTER INSERT ON marketplace."ProviderProfile" FOR EACH ROW EXECUTE FUNCTION marketplace.sync_provider_history();
CREATE TRIGGER sync_provider_history AFTER INSERT OR UPDATE OR DELETE ON marketplace."Booking" FOR EACH ROW EXECUTE FUNCTION marketplace.sync_provider_history();
CREATE TRIGGER sync_provider_history AFTER INSERT OR UPDATE OR DELETE ON public."Booking" FOR EACH ROW EXECUTE FUNCTION marketplace.sync_provider_history();
CREATE TRIGGER sync_provider_history AFTER INSERT OR UPDATE OR DELETE ON public."Review" FOR EACH ROW EXECUTE FUNCTION marketplace.sync_provider_history();
CREATE OR REPLACE FUNCTION marketplace.refresh_rating() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
DECLARE profile uuid; actor uuid;
BEGIN
 profile=CASE WHEN TG_OP='DELETE' THEN OLD.provider_profile_id ELSE NEW.provider_profile_id END;
 SELECT created_by_id INTO actor FROM marketplace."ProviderProfile" WHERE id=profile;
 PERFORM marketplace.refresh_provider_history(actor);
 IF TG_OP='UPDATE' THEN UPDATE marketplace."Booking" SET rating=NEW.rating WHERE id=NEW.booking_id;
 ELSIF TG_OP='DELETE' THEN UPDATE marketplace."Booking" SET rating=NULL,review_id=NULL WHERE id=OLD.booking_id; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DO $$ DECLARE profile record; BEGIN FOR profile IN SELECT created_by_id FROM marketplace."ProviderProfile" LOOP PERFORM marketplace.refresh_provider_history(profile.created_by_id); END LOOP; END $$;
REVOKE ALL ON FUNCTION marketplace.refresh_provider_history(uuid),marketplace.sync_provider_history() FROM PUBLIC;

CREATE OR REPLACE FUNCTION marketplace."completeBooking"(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
DECLARE job marketplace."Booking"; p marketplace."ProviderProfile"; next_status text; new_evidence jsonb;
BEGIN
 PERFORM marketplace.require_actor();
 SELECT * INTO job FROM marketplace."Booking" WHERE id=(input->>'booking_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found' USING ERRCODE='P0002'; END IF;
 SELECT * INTO p FROM marketplace."ProviderProfile" WHERE id=job.provider_profile_id FOR UPDATE;
 IF input->>'action'='advance' THEN
  IF p.created_by_id<>marketplace.actor_id() THEN RAISE EXCEPTION 'Only the assigned provider can advance a booking' USING ERRCODE='42501'; END IF;
  next_status=CASE job.status WHEN 'confirmed' THEN 'en_route' WHEN 'en_route' THEN 'arrived' WHEN 'arrived' THEN 'in_progress' WHEN 'in_progress' THEN 'completed' END;
  IF next_status IS NULL OR (input ? 'status' AND input->>'status'<>next_status) THEN RAISE EXCEPTION 'Invalid booking transition' USING ERRCODE='23514'; END IF;
 ELSIF input->>'action'='close' THEN
  IF job.created_by_id<>marketplace.actor_id() THEN RAISE EXCEPTION 'Only the customer can confirm completion' USING ERRCODE='42501'; END IF;
  IF job.status<>'completed' THEN RAISE EXCEPTION 'Provider completion is required first' USING ERRCODE='23514'; END IF;
  next_status='closed';
 ELSE RAISE EXCEPTION 'Unknown booking action' USING ERRCODE='23514'; END IF;
 new_evidence=coalesce(input->'evidence','[]');
 IF jsonb_typeof(new_evidence)<>'array' OR jsonb_array_length(new_evidence)>4 OR NOT marketplace.check_uploads(new_evidence,'evidence') THEN RAISE EXCEPTION 'Invalid completion evidence' USING ERRCODE='42501'; END IF;
 UPDATE marketplace."Booking" SET status=next_status,customer_confirmed=next_status='closed',evidence=evidence||new_evidence,timeline=timeline||jsonb_build_array(jsonb_build_object('status',next_status,'at',now(),'by',marketplace.actor_id())) WHERE id=job.id RETURNING * INTO job;
 IF next_status='in_progress' THEN UPDATE marketplace."ServiceRequest" SET status='in_progress' WHERE id=job.request_id;
 ELSIF next_status='closed' THEN
  UPDATE marketplace."ServiceRequest" SET status='completed' WHERE id=job.request_id;
  UPDATE marketplace."ProviderProfile" SET availability='online' WHERE id=p.id;
 END IF;
 PERFORM marketplace.notify(CASE WHEN input->>'action'='close' THEN p.user_email ELSE job.customer_email END,'Booking updated',job.reference||': '||replace(next_status,'_',' '),'booking','/bookings');
 RETURN to_jsonb(job);
END $$;
CREATE OR REPLACE FUNCTION marketplace."submitBid"(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
DECLARE r marketplace."ServiceRequest"; p marketplace."ProviderProfile"; c marketplace."ServiceCategory"; cfg marketplace."PlatformSetting"; b marketplace."Bid"; total numeric; max_total numeric;
BEGIN
 PERFORM marketplace.require_actor();
 SELECT * INTO r FROM marketplace."ServiceRequest" WHERE id=(input->>'request_id')::uuid FOR UPDATE;
 IF NOT FOUND OR r.status<>'open' THEN RAISE EXCEPTION 'Request is not open' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM marketplace."ProviderProfile" WHERE created_by_id=marketplace.actor_id() FOR UPDATE;
 IF NOT FOUND OR p.verification_status<>'approved' OR p.availability<>'online' OR r.created_by_id=p.created_by_id THEN RAISE EXCEPTION 'An approved, online provider is required' USING ERRCODE='42501'; END IF;
 IF NOT r.category_slug=ANY(p.category_slugs) OR marketplace.distance_km(p.latitude,p.longitude,r.latitude,r.longitude)>p.service_radius_km OR (r.urgency='emergency' AND NOT p.emergency_available) THEN RAISE EXCEPTION 'Request is outside your service coverage' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM marketplace."ServiceCategory" WHERE slug=r.category_slug;
 SELECT * INTO cfg FROM marketplace."PlatformSetting" WHERE key='config';
 total=(input->>'callout_fee_cents')::numeric+(input->>'labour_cents')::numeric+(input->>'materials_cents')::numeric+(input->>'travel_cents')::numeric+(input->>'after_hours_cents')::numeric;
 IF total IS NULL OR total<>(input->>'price_cents')::numeric OR total<c.callout_fee_cents THEN RAISE EXCEPTION 'Quote components must sum to the price and meet the callout minimum' USING ERRCODE='23514'; END IF;
 IF input->>'valid_until' IS NULL OR (input->>'valid_until')::timestamptz<=now() THEN RAISE EXCEPTION 'Quote validity must be in the future' USING ERRCODE='23514'; END IF;
 IF r.urgency='emergency' THEN
  max_total=floor((c.callout_fee_cents+round(c.hourly_rate_cents::numeric*(input->>'duration_minutes')::integer/60))*(100+cfg.emergency_cap_pct)/100);
  IF total>max_total THEN RAISE EXCEPTION 'Quote exceeds the emergency surcharge cap' USING ERRCODE='23514'; END IF;
 END IF;
 UPDATE marketplace."ProviderProfile" SET response_minutes=greatest(0,round(extract(epoch FROM now()-r.created_date)/60)::integer) WHERE id=p.id;
 INSERT INTO marketplace."Bid"(created_by_id,request_id,request_reference,category_slug,customer_user_id,provider_profile_id,provider_name,provider_user_email,price_cents,callout_fee_cents,labour_cents,materials_cents,travel_cents,after_hours_cents,eta_minutes,duration_minutes,warranty_days,valid_until,comments,pricing_version)
 VALUES(p.created_by_id,r.id,r.reference,r.category_slug,r.created_by_id,p.id,p.display_name,p.user_email,(input->>'price_cents')::bigint,(input->>'callout_fee_cents')::bigint,(input->>'labour_cents')::bigint,(input->>'materials_cents')::bigint,(input->>'travel_cents')::bigint,(input->>'after_hours_cents')::bigint,(input->>'eta_minutes')::integer,(input->>'duration_minutes')::integer,coalesce((input->>'warranty_days')::integer,0),(input->>'valid_until')::timestamptz,coalesce(input->>'comments',''),cfg.pricing_version)
 ON CONFLICT(request_id,provider_profile_id) DO UPDATE SET price_cents=excluded.price_cents,callout_fee_cents=excluded.callout_fee_cents,labour_cents=excluded.labour_cents,materials_cents=excluded.materials_cents,travel_cents=excluded.travel_cents,after_hours_cents=excluded.after_hours_cents,eta_minutes=excluded.eta_minutes,duration_minutes=excluded.duration_minutes,warranty_days=excluded.warranty_days,valid_until=excluded.valid_until,comments=excluded.comments,status='submitted',score=NULL,score_breakdown=NULL,score_explanation=NULL,scoring_version=NULL,pricing_version=excluded.pricing_version RETURNING * INTO b;
 UPDATE marketplace."ServiceRequest" SET bid_count=(SELECT count(*) FROM marketplace."Bid" WHERE request_id=r.id AND status='submitted') WHERE id=r.id;
 PERFORM marketplace.notify(r.customer_email,'New quote received',p.display_name||' quoted on '||r.reference,'quote','/requests/'||r.id);
 RETURN to_jsonb(b);
END $$;
-- Retained booking writes acquire the same provider-row lock before the shared
-- capacity reservation, so completion and new acceptance use a consistent order.
CREATE FUNCTION marketplace.lock_existing_provider() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace,public AS $$ DECLARE bid uuid; actor uuid; BEGIN bid=CASE WHEN TG_OP='DELETE' THEN OLD."bidId" ELSE NEW."bidId" END;SELECT p."userId" INTO actor FROM public."Bid" q JOIN public."ProviderProfile" p ON p.id=q."providerId" WHERE q.id=bid;PERFORM id FROM marketplace."ProviderProfile" WHERE created_by_id=actor FOR UPDATE;RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;END $$;
CREATE TRIGGER lock_contract_provider BEFORE INSERT OR UPDATE OR DELETE ON public."Booking" FOR EACH ROW EXECUTE FUNCTION marketplace.lock_existing_provider();
REVOKE ALL ON FUNCTION marketplace.lock_existing_provider() FROM PUBLIC;
