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
CREATE OR REPLACE FUNCTION marketplace.can_read_file(file_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
SELECT EXISTS (
 SELECT FROM marketplace."PrivateUpload" f WHERE f.id=file_id AND (
  marketplace.is_admin() OR f.created_by_id=marketplace.actor_id() OR
  (f.bucket<>'documents' AND EXISTS(SELECT FROM marketplace."Booking" b JOIN marketplace."ServiceRequest" r ON r.id=b.request_id WHERE marketplace.actor_id()=ANY(b.members) AND (r.attachments @> jsonb_build_array(f.uri) OR b.evidence @> jsonb_build_array(f.uri)))) OR
  (f.bucket='requests' AND EXISTS(SELECT FROM marketplace."ServiceRequest" r JOIN marketplace."ProviderProfile" p ON p.created_by_id=marketplace.actor_id() WHERE r.attachments @> jsonb_build_array(f.uri) AND r.status='open' AND p.verification_status='approved' AND p.availability='online' AND r.category_slug=ANY(p.category_slugs) AND marketplace.distance_km(p.latitude,p.longitude,r.latitude,r.longitude)<=p.service_radius_km AND (r.urgency<>'emergency' OR p.emergency_available)))
 )
) $$;
CREATE FUNCTION marketplace.validate_contact() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.description=btrim(NEW.description);NEW.address=btrim(NEW.address);NEW.suburb=btrim(NEW.suburb);IF NEW.status='open' AND (NEW.customer_phone !~ '^\+[1-9][0-9]{7,14}$' OR length(NEW.address)<3 OR length(NEW.suburb)<1) THEN RAISE EXCEPTION 'Provide a valid contact number, address and suburb' USING ERRCODE='23514'; END IF;RETURN NEW;END $$;
CREATE TRIGGER validate_contact BEFORE INSERT OR UPDATE ON marketplace."ServiceRequest" FOR EACH ROW EXECUTE FUNCTION marketplace.validate_contact();
REVOKE ALL ON FUNCTION marketplace.validate_contact() FROM PUBLIC;
