CREATE FUNCTION marketplace.provider_is_suspended(actor uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,marketplace,public AS $$ SELECT EXISTS(SELECT FROM marketplace."ProviderProfile" WHERE created_by_id=actor AND verification_status='suspended') OR EXISTS(SELECT FROM public."ProviderProfile" WHERE "userId"=actor AND verification='SUSPENDED') $$;
REVOKE ALL ON FUNCTION marketplace.provider_is_suspended(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketplace.provider_is_suspended(uuid) TO convyn_marketplace;
CREATE OR REPLACE FUNCTION marketplace.lock_existing_provider() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace,public AS $$ DECLARE bid uuid; actor uuid; BEGIN bid=CASE WHEN TG_OP='DELETE' THEN OLD."bidId" ELSE NEW."bidId" END;SELECT p."userId" INTO actor FROM public."Bid" q JOIN public."ProviderProfile" p ON p.id=q."providerId" WHERE q.id=bid;PERFORM id FROM marketplace."ProviderProfile" WHERE created_by_id=actor FOR UPDATE;IF TG_OP='INSERT' AND marketplace.provider_is_suspended(actor) THEN RAISE EXCEPTION 'Provider account is suspended' USING ERRCODE='23505';END IF;RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;END $$;

CREATE OR REPLACE FUNCTION marketplace."submitBid"(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
DECLARE r marketplace."ServiceRequest"; p marketplace."ProviderProfile"; c marketplace."ServiceCategory"; cfg marketplace."PlatformSetting"; b marketplace."Bid"; total numeric; max_total numeric;
BEGIN
 PERFORM marketplace.require_actor();
 SELECT * INTO r FROM marketplace."ServiceRequest" WHERE id=(input->>'request_id')::uuid FOR UPDATE;
 IF NOT FOUND OR r.status<>'open' THEN RAISE EXCEPTION 'Request is not open' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM marketplace."ProviderProfile" WHERE created_by_id=marketplace.actor_id() FOR UPDATE;
 IF marketplace.provider_is_suspended(p.created_by_id) THEN RAISE EXCEPTION 'Provider account is suspended' USING ERRCODE='42501'; END IF;
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
CREATE OR REPLACE FUNCTION marketplace."acceptBid"(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
DECLARE r marketplace."ServiceRequest"; b marketplace."Bid"; p marketplace."ProviderProfile"; c marketplace."ServiceCategory"; cfg marketplace."PlatformSetting"; job marketplace."Booking"; pct integer; fee bigint; other record;
BEGIN
 PERFORM marketplace.require_actor();
 SELECT request_id INTO b.request_id FROM marketplace."Bid" WHERE id=(input->>'bid_id')::uuid;
 SELECT * INTO r FROM marketplace."ServiceRequest" WHERE id=b.request_id FOR UPDATE;
 IF NOT FOUND OR r.created_by_id<>marketplace.actor_id() THEN RAISE EXCEPTION 'Only the request customer can accept a quote' USING ERRCODE='42501'; END IF;
 IF r.status<>'open' THEN RAISE EXCEPTION 'This request has already been awarded or closed' USING ERRCODE='23505'; END IF;
 SELECT * INTO b FROM marketplace."Bid" WHERE id=(input->>'bid_id')::uuid FOR UPDATE;
 IF nullif(current_setting('convyn.expected_quote_amount',true),'') IS NOT NULL AND b.price_cents<>current_setting('convyn.expected_quote_amount',true)::bigint THEN RAISE EXCEPTION 'The quote amount changed. Review the updated quote before accepting.' USING ERRCODE='23505'; END IF;
 IF b.status<>'submitted' OR b.valid_until<=now() THEN RAISE EXCEPTION 'Quote is not available or has expired' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM marketplace."ProviderProfile" WHERE id=b.provider_profile_id FOR UPDATE;
 IF marketplace.provider_is_suspended(p.created_by_id) THEN RAISE EXCEPTION 'Provider account is suspended' USING ERRCODE='42501'; END IF;
 IF p.verification_status<>'approved' OR p.availability<>'online' OR EXISTS(SELECT FROM marketplace."Booking" WHERE provider_profile_id=p.id AND status NOT IN ('closed','cancelled')) THEN RAISE EXCEPTION 'Provider is no longer available' USING ERRCODE='23505'; END IF;
 SELECT * INTO c FROM marketplace."ServiceCategory" WHERE slug=r.category_slug;
 SELECT * INTO cfg FROM marketplace."PlatformSetting" WHERE key='config';
 pct=coalesce(c.commission_pct,cfg.commission_pct); fee=round(b.price_cents::numeric*pct/100)::bigint;
 INSERT INTO marketplace."Booking"(created_by_id,request_id,request_reference,bid_id,category_name,customer_name,customer_email,customer_phone,provider_profile_id,provider_name,provider_user_email,members,amount_cents,commission_cents,payout_cents,commission_pct,scheduled_for,address,suburb,city,timeline)
 VALUES(r.created_by_id,r.id,r.reference,b.id,r.category_name,r.customer_name,r.customer_email,r.customer_phone,p.id,p.display_name,p.user_email,ARRAY[r.created_by_id,p.created_by_id],b.price_cents,fee,b.price_cents-fee,pct,r.scheduled_for,r.address,r.suburb,r.city,jsonb_build_array(jsonb_build_object('status','confirmed','at',now(),'by',marketplace.actor_id()))) RETURNING * INTO job;
 UPDATE marketplace."Bid" SET status=CASE WHEN id=b.id THEN 'accepted' ELSE 'rejected' END WHERE request_id=r.id AND (status='submitted' OR id=b.id);
 UPDATE marketplace."ServiceRequest" SET status='awarded',accepted_bid_id=b.id,booking_id=job.id WHERE id=r.id;
 UPDATE marketplace."ProviderProfile" SET availability='busy' WHERE id=p.id;
 PERFORM marketplace.notify(r.customer_email,'Booking confirmed',job.reference||' has been created.','booking','/bookings');
 PERFORM marketplace.notify(p.user_email,'Quote accepted',job.reference||' is ready to start.','booking','/bookings');
 FOR other IN SELECT provider_user_email FROM marketplace."Bid" WHERE request_id=r.id AND id<>b.id AND status='rejected' LOOP
  PERFORM marketplace.notify(other.provider_user_email,'Request awarded','Another quote was selected for '||r.reference,'quote','/provider');
 END LOOP;
 RETURN jsonb_build_object('booking',to_jsonb(job));
END $$;
