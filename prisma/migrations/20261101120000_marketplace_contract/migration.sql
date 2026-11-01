-- Additive contract tables: existing public marketplace/organisation data is preserved.
CREATE SCHEMA marketplace;
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='convyn_marketplace') THEN CREATE ROLE convyn_marketplace NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; END IF; EXECUTE format('GRANT convyn_marketplace TO %I', current_user); END $$;
CREATE FUNCTION marketplace.actor_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('convyn.actor_id',true),'')::uuid $$;
CREATE FUNCTION marketplace.actor_email() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT email FROM public."User" WHERE id=marketplace.actor_id() $$;
CREATE FUNCTION marketplace.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT coalesce((SELECT role='ADMIN' FROM public."User" WHERE id=marketplace.actor_id()),false) $$;
CREATE FUNCTION marketplace.require_actor() RETURNS uuid LANGUAGE plpgsql STABLE AS $$ BEGIN IF marketplace.actor_id() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF; RETURN marketplace.actor_id(); END $$;

CREATE TABLE marketplace."ServiceCategory" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_date timestamptz NOT NULL DEFAULT now(), updated_date timestamptz NOT NULL DEFAULT now(), created_by_id uuid REFERENCES public."User"(id) ON DELETE RESTRICT, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100), slug text NOT NULL UNIQUE CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'), blurb text NOT NULL DEFAULT '', callout_fee_cents bigint NOT NULL CHECK(callout_fee_cents BETWEEN 0 AND 9007199254740991), hourly_rate_cents bigint NOT NULL CHECK(hourly_rate_cents BETWEEN 0 AND 9007199254740991), emergency_supported boolean NOT NULL DEFAULT false, commission_pct integer CHECK(commission_pct BETWEEN 0 AND 100), active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0);
ALTER TABLE marketplace."ServiceCategory" ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON marketplace."ServiceCategory"(created_by_id);

CREATE TABLE marketplace."ProviderProfile" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_date timestamptz NOT NULL DEFAULT now(), updated_date timestamptz NOT NULL DEFAULT now(), created_by_id uuid REFERENCES public."User"(id) ON DELETE RESTRICT, user_email text NOT NULL, display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 150), provider_type text NOT NULL DEFAULT 'individual' CHECK(provider_type IN ('individual','business','company')), business_name text NOT NULL DEFAULT '', registration_number text NOT NULL DEFAULT '', bio text NOT NULL DEFAULT '' CHECK(length(bio)<=5000), skills text[] NOT NULL DEFAULT '{}', category_slugs text[] NOT NULL DEFAULT '{}', city text NOT NULL DEFAULT 'Gqeberha', suburb text NOT NULL DEFAULT '', latitude double precision NOT NULL DEFAULT -33.96 CHECK(latitude BETWEEN -90 AND 90), longitude double precision NOT NULL DEFAULT 25.60 CHECK(longitude BETWEEN -180 AND 180), service_radius_km integer NOT NULL DEFAULT 30 CHECK(service_radius_km BETWEEN 1 AND 300), availability text NOT NULL DEFAULT 'offline' CHECK(availability IN ('online','offline','busy')), emergency_available boolean NOT NULL DEFAULT false, hourly_rate_cents bigint NOT NULL DEFAULT 0 CHECK(hourly_rate_cents BETWEEN 0 AND 9007199254740991), callout_fee_cents bigint NOT NULL DEFAULT 0 CHECK(callout_fee_cents BETWEEN 0 AND 9007199254740991), verification_status text NOT NULL DEFAULT 'draft' CHECK(verification_status IN ('draft','submitted','under_review','more_info','approved','rejected','suspended')), verification_notes text NOT NULL DEFAULT '', documents jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(documents)='array' AND jsonb_array_length(documents)<=10), payout_method text NOT NULL DEFAULT '', rating_avg numeric(3,2) NOT NULL DEFAULT 0 CHECK(rating_avg BETWEEN 0 AND 5), reviews_count integer NOT NULL DEFAULT 0 CHECK(reviews_count>=0), jobs_completed integer NOT NULL DEFAULT 0 CHECK(jobs_completed>=0), on_time_rate integer NOT NULL DEFAULT 0 CHECK(on_time_rate BETWEEN 0 AND 100), response_minutes integer NOT NULL DEFAULT 60 CHECK(response_minutes>=0), member_since timestamptz NOT NULL DEFAULT now(), UNIQUE(created_by_id));
ALTER TABLE marketplace."ProviderProfile" ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON marketplace."ProviderProfile"(created_by_id);

CREATE TABLE marketplace."ServiceRequest" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_date timestamptz NOT NULL DEFAULT now(), updated_date timestamptz NOT NULL DEFAULT now(), created_by_id uuid REFERENCES public."User"(id) ON DELETE RESTRICT, reference text NOT NULL UNIQUE DEFAULT ('CV-R-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))), customer_name text NOT NULL DEFAULT '', customer_email text NOT NULL DEFAULT '', customer_phone text NOT NULL DEFAULT '', category_slug text NOT NULL REFERENCES marketplace."ServiceCategory"(slug) ON UPDATE RESTRICT, category_name text NOT NULL DEFAULT '', description text NOT NULL CHECK(length(description) BETWEEN 20 AND 5000), address text NOT NULL DEFAULT '', suburb text NOT NULL DEFAULT '', city text NOT NULL DEFAULT 'Gqeberha' CHECK(city IN ('Gqeberha','East London','Cape Town','Durban','Johannesburg','Pretoria')), latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90), longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180), urgency text NOT NULL DEFAULT 'standard' CHECK(urgency IN ('emergency','urgent','standard','scheduled')), scheduled_for timestamptz, budget_hint_cents bigint CHECK(budget_hint_cents BETWEEN 0 AND 9007199254740991), attachments jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(attachments)='array' AND jsonb_array_length(attachments)<=4), ai_summary text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','awarded','in_progress','completed','cancelled')), accepted_bid_id uuid, booking_id uuid, bid_count integer NOT NULL DEFAULT 0 CHECK(bid_count>=0), admin_note text NOT NULL DEFAULT '' );
ALTER TABLE marketplace."ServiceRequest" ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON marketplace."ServiceRequest"(created_by_id);

CREATE TABLE marketplace."Bid" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_date timestamptz NOT NULL DEFAULT now(), updated_date timestamptz NOT NULL DEFAULT now(), created_by_id uuid REFERENCES public."User"(id) ON DELETE RESTRICT, request_id uuid NOT NULL REFERENCES marketplace."ServiceRequest"(id) ON DELETE RESTRICT, request_reference text NOT NULL, category_slug text NOT NULL, customer_user_id uuid NOT NULL REFERENCES public."User"(id), provider_profile_id uuid NOT NULL REFERENCES marketplace."ProviderProfile"(id), provider_name text NOT NULL, provider_user_email text NOT NULL, price_cents bigint NOT NULL CHECK(price_cents BETWEEN 0 AND 9007199254740991), callout_fee_cents bigint NOT NULL CHECK(callout_fee_cents>=0), labour_cents bigint NOT NULL CHECK(labour_cents>=0), materials_cents bigint NOT NULL CHECK(materials_cents>=0), travel_cents bigint NOT NULL CHECK(travel_cents>=0), after_hours_cents bigint NOT NULL CHECK(after_hours_cents>=0), eta_minutes integer NOT NULL CHECK(eta_minutes BETWEEN 1 AND 10080), duration_minutes integer NOT NULL CHECK(duration_minutes BETWEEN 1 AND 10080), warranty_days integer NOT NULL DEFAULT 0 CHECK(warranty_days BETWEEN 0 AND 3650), valid_until timestamptz NOT NULL, comments text NOT NULL DEFAULT '' CHECK(length(comments)<=5000), score numeric(5,2) CHECK(score BETWEEN 0 AND 100), score_breakdown jsonb, score_explanation text, scoring_version text, pricing_version text NOT NULL, status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','withdrawn','accepted','rejected','expired')), UNIQUE(request_id,provider_profile_id), CHECK(callout_fee_cents::numeric+labour_cents+materials_cents+travel_cents+after_hours_cents=price_cents));
ALTER TABLE marketplace."Bid" ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON marketplace."Bid"(created_by_id);

CREATE TABLE marketplace."Booking" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_date timestamptz NOT NULL DEFAULT now(), updated_date timestamptz NOT NULL DEFAULT now(), created_by_id uuid REFERENCES public."User"(id) ON DELETE RESTRICT, reference text NOT NULL UNIQUE DEFAULT ('CV-B-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))), request_id uuid NOT NULL UNIQUE REFERENCES marketplace."ServiceRequest"(id) ON DELETE RESTRICT, request_reference text NOT NULL, bid_id uuid NOT NULL UNIQUE REFERENCES marketplace."Bid"(id), category_name text NOT NULL, customer_name text NOT NULL, customer_email text NOT NULL, customer_phone text NOT NULL, provider_profile_id uuid NOT NULL REFERENCES marketplace."ProviderProfile"(id), provider_name text NOT NULL, provider_user_email text NOT NULL, members uuid[] NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents BETWEEN 0 AND 9007199254740991), commission_cents bigint NOT NULL CHECK(commission_cents>=0), payout_cents bigint NOT NULL CHECK(payout_cents>=0), commission_pct integer NOT NULL CHECK(commission_pct BETWEEN 0 AND 100), status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','en_route','arrived','in_progress','completed','closed','cancelled','disputed')), scheduled_for timestamptz, address text NOT NULL, suburb text NOT NULL, city text NOT NULL, timeline jsonb NOT NULL DEFAULT '[]', evidence jsonb NOT NULL DEFAULT '[]', customer_confirmed boolean NOT NULL DEFAULT false, rating integer CHECK(rating BETWEEN 1 AND 5), review_id uuid, notes text NOT NULL DEFAULT '', CHECK(commission_cents+payout_cents=amount_cents));
ALTER TABLE marketplace."Booking" ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON marketplace."Booking"(created_by_id);

CREATE TABLE marketplace."Review" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_date timestamptz NOT NULL DEFAULT now(), updated_date timestamptz NOT NULL DEFAULT now(), created_by_id uuid REFERENCES public."User"(id) ON DELETE RESTRICT, booking_id uuid NOT NULL UNIQUE REFERENCES marketplace."Booking"(id), provider_profile_id uuid NOT NULL REFERENCES marketplace."ProviderProfile"(id), provider_name text NOT NULL, customer_name text NOT NULL, customer_email text NOT NULL, rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5), comment text NOT NULL CHECK(length(comment) BETWEEN 3 AND 3000), tags text[] NOT NULL DEFAULT '{}' );
ALTER TABLE marketplace."Review" ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON marketplace."Review"(created_by_id);

CREATE TABLE marketplace."Notification" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_date timestamptz NOT NULL DEFAULT now(), updated_date timestamptz NOT NULL DEFAULT now(), created_by_id uuid REFERENCES public."User"(id) ON DELETE RESTRICT, user_email text NOT NULL, title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200), body text NOT NULL DEFAULT '', type text NOT NULL DEFAULT 'activity', link text NOT NULL DEFAULT '/dashboard' CHECK(link ~ '^/[^/]' AND link !~ '[\\]'), read boolean NOT NULL DEFAULT false);
ALTER TABLE marketplace."Notification" ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON marketplace."Notification"(created_by_id);

CREATE TABLE marketplace."PlatformSetting" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_date timestamptz NOT NULL DEFAULT now(), updated_date timestamptz NOT NULL DEFAULT now(), created_by_id uuid REFERENCES public."User"(id) ON DELETE RESTRICT, key text NOT NULL UNIQUE CHECK(key='config'), commission_pct integer NOT NULL DEFAULT 12 CHECK(commission_pct BETWEEN 0 AND 100), vat_pct integer NOT NULL DEFAULT 15 CHECK(vat_pct BETWEEN 0 AND 100), emergency_cap_pct integer NOT NULL DEFAULT 60 CHECK(emergency_cap_pct BETWEEN 0 AND 1000), weights jsonb NOT NULL DEFAULT '{"skills":20,"ratings":15,"experience":15,"credentials":15,"reliability":15,"location":10,"response":5,"recommendations":5}', pricing_version text NOT NULL DEFAULT 'pricing-v1', marketplace_city text NOT NULL DEFAULT 'Gqeberha', support_email text NOT NULL DEFAULT 'support@convyn.cloud' );
ALTER TABLE marketplace."PlatformSetting" ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON marketplace."PlatformSetting"(created_by_id);

CREATE TABLE marketplace."AuditLog" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_date timestamptz NOT NULL DEFAULT now(), updated_date timestamptz NOT NULL DEFAULT now(), created_by_id uuid REFERENCES public."User"(id) ON DELETE RESTRICT, actor_email text, action text NOT NULL, entity_type text NOT NULL, entity_id uuid, detail jsonb NOT NULL DEFAULT '{}' );
ALTER TABLE marketplace."AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON marketplace."AuditLog"(created_by_id);

CREATE TABLE marketplace."PrivateUpload" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_date timestamptz NOT NULL DEFAULT now(), updated_date timestamptz NOT NULL DEFAULT now(), created_by_id uuid REFERENCES public."User"(id) ON DELETE RESTRICT, bucket text NOT NULL CHECK(bucket IN ('requests','documents','evidence')), storage_key text NOT NULL UNIQUE, original_name text NOT NULL, mime text NOT NULL, size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760), sha256 text NOT NULL, uri text NOT NULL UNIQUE);
ALTER TABLE marketplace."PrivateUpload" ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON marketplace."PrivateUpload"(created_by_id);

CREATE TABLE marketplace."PasswordRecovery" (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_date timestamptz NOT NULL DEFAULT now(), updated_date timestamptz NOT NULL DEFAULT now(), created_by_id uuid REFERENCES public."User"(id) ON DELETE RESTRICT, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, used_at timestamptz);
ALTER TABLE marketplace."PasswordRecovery" ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON marketplace."PasswordRecovery"(created_by_id);

ALTER TABLE marketplace."ServiceRequest" ADD FOREIGN KEY(accepted_bid_id) REFERENCES marketplace."Bid"(id), ADD FOREIGN KEY(booking_id) REFERENCES marketplace."Booking"(id);
ALTER TABLE marketplace."Booking" ADD FOREIGN KEY(review_id) REFERENCES marketplace."Review"(id);
CREATE UNIQUE INDEX one_active_contract_job ON marketplace."Booking"(provider_profile_id) WHERE status NOT IN ('closed','cancelled');
CREATE INDEX ON marketplace."Bid"(customer_user_id); CREATE INDEX ON marketplace."Notification"(user_email,created_date DESC);
CREATE INDEX ON marketplace."ServiceRequest"(status,category_slug); CREATE INDEX ON marketplace."Booking" USING gin(members);
CREATE FUNCTION marketplace.touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_date=now(); RETURN NEW; END $$;
CREATE TRIGGER touch BEFORE UPDATE ON marketplace."ServiceCategory" FOR EACH ROW EXECUTE FUNCTION marketplace.touch();
CREATE TRIGGER touch BEFORE UPDATE ON marketplace."ProviderProfile" FOR EACH ROW EXECUTE FUNCTION marketplace.touch();
CREATE TRIGGER touch BEFORE UPDATE ON marketplace."ServiceRequest" FOR EACH ROW EXECUTE FUNCTION marketplace.touch();
CREATE TRIGGER touch BEFORE UPDATE ON marketplace."Bid" FOR EACH ROW EXECUTE FUNCTION marketplace.touch();
CREATE TRIGGER touch BEFORE UPDATE ON marketplace."Booking" FOR EACH ROW EXECUTE FUNCTION marketplace.touch();
CREATE TRIGGER touch BEFORE UPDATE ON marketplace."Review" FOR EACH ROW EXECUTE FUNCTION marketplace.touch();
CREATE TRIGGER touch BEFORE UPDATE ON marketplace."Notification" FOR EACH ROW EXECUTE FUNCTION marketplace.touch();
CREATE TRIGGER touch BEFORE UPDATE ON marketplace."PlatformSetting" FOR EACH ROW EXECUTE FUNCTION marketplace.touch();
CREATE TRIGGER touch BEFORE UPDATE ON marketplace."AuditLog" FOR EACH ROW EXECUTE FUNCTION marketplace.touch();
CREATE TRIGGER touch BEFORE UPDATE ON marketplace."PrivateUpload" FOR EACH ROW EXECUTE FUNCTION marketplace.touch();
CREATE TRIGGER touch BEFORE UPDATE ON marketplace."PasswordRecovery" FOR EACH ROW EXECUTE FUNCTION marketplace.touch();
CREATE POLICY readable ON marketplace."ServiceCategory" FOR SELECT TO convyn_marketplace USING(true);
CREATE POLICY managed ON marketplace."ServiceCategory" FOR ALL TO convyn_marketplace USING(marketplace.is_admin()) WITH CHECK(marketplace.is_admin());
CREATE POLICY readable ON marketplace."PlatformSetting" FOR SELECT TO convyn_marketplace USING(true);
CREATE POLICY managed ON marketplace."PlatformSetting" FOR ALL TO convyn_marketplace USING(marketplace.is_admin()) WITH CHECK(marketplace.is_admin());
CREATE POLICY owned ON marketplace."ProviderProfile" FOR ALL TO convyn_marketplace USING(created_by_id=marketplace.actor_id() OR marketplace.is_admin()) WITH CHECK(created_by_id=marketplace.actor_id() OR marketplace.is_admin());
CREATE POLICY owned ON marketplace."ServiceRequest" FOR ALL TO convyn_marketplace USING(created_by_id=marketplace.actor_id() OR marketplace.is_admin()) WITH CHECK(created_by_id=marketplace.actor_id() OR marketplace.is_admin());
CREATE POLICY owned ON marketplace."PrivateUpload" FOR ALL TO convyn_marketplace USING(created_by_id=marketplace.actor_id() OR marketplace.is_admin()) WITH CHECK(created_by_id=marketplace.actor_id() OR marketplace.is_admin());

CREATE POLICY bids_read ON marketplace."Bid" FOR SELECT TO convyn_marketplace USING(created_by_id=marketplace.actor_id() OR customer_user_id=marketplace.actor_id() OR marketplace.is_admin());
CREATE POLICY bookings_read ON marketplace."Booking" FOR SELECT TO convyn_marketplace USING(marketplace.actor_id()=ANY(members) OR marketplace.is_admin());
CREATE POLICY reviews_read ON marketplace."Review" FOR SELECT TO convyn_marketplace USING(true);
CREATE POLICY reviews_manage ON marketplace."Review" FOR UPDATE TO convyn_marketplace USING(created_by_id=marketplace.actor_id() OR marketplace.is_admin()) WITH CHECK(created_by_id=marketplace.actor_id() OR marketplace.is_admin());
CREATE POLICY reviews_delete ON marketplace."Review" FOR DELETE TO convyn_marketplace USING(created_by_id=marketplace.actor_id() OR marketplace.is_admin());
CREATE POLICY notifications ON marketplace."Notification" FOR ALL TO convyn_marketplace USING(user_email=marketplace.actor_email() OR marketplace.is_admin()) WITH CHECK(user_email=marketplace.actor_email() OR marketplace.is_admin());
CREATE POLICY audit_read ON marketplace."AuditLog" FOR SELECT TO convyn_marketplace USING(marketplace.is_admin());
GRANT USAGE ON SCHEMA marketplace TO convyn_marketplace;
GRANT SELECT ON ALL TABLES IN SCHEMA marketplace TO convyn_marketplace;
REVOKE ALL ON marketplace."PasswordRecovery" FROM convyn_marketplace;
GRANT INSERT,UPDATE,DELETE ON marketplace."ServiceCategory",marketplace."ProviderProfile",marketplace."ServiceRequest",marketplace."Notification",marketplace."PlatformSetting" TO convyn_marketplace;
GRANT UPDATE,DELETE ON marketplace."Review" TO convyn_marketplace;
GRANT INSERT ON marketplace."PrivateUpload" TO convyn_marketplace;
CREATE FUNCTION marketplace.notify(recipient text,title text,body text,kind text,link text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$ INSERT INTO marketplace."Notification"(created_by_id,user_email,title,body,type,link) SELECT marketplace.actor_id(),recipient,title,body,kind,link WHERE recipient IS NOT NULL $$;
CREATE FUNCTION marketplace.audit(action text,entity text,entity_id uuid,detail jsonb DEFAULT '{}') RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$ INSERT INTO marketplace."AuditLog"(created_by_id,actor_email,action,entity_type,entity_id,detail) VALUES(marketplace.actor_id(),marketplace.actor_email(),action,entity,entity_id,detail) $$;
CREATE FUNCTION marketplace.distance_km(lat1 float8,lng1 float8,lat2 float8,lng2 float8) RETURNS float8 LANGUAGE sql IMMUTABLE AS $$ SELECT 6371*2*asin(sqrt(least(1.0,power(sin(radians(lat2-lat1)/2),2)+cos(radians(lat1))*cos(radians(lat2))*power(sin(radians(lng2-lng1)/2),2)))) $$;
CREATE FUNCTION marketplace.check_uploads(uris jsonb,bucket_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$ SELECT jsonb_typeof(uris)='array' AND NOT EXISTS(SELECT FROM jsonb_array_elements_text(uris) v WHERE NOT EXISTS(SELECT FROM marketplace."PrivateUpload" u WHERE u.uri=v AND u.bucket=bucket_name AND u.created_by_id=marketplace.actor_id())) $$;
CREATE FUNCTION marketplace.guard_entity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,marketplace,public AS $$
DECLARE c marketplace."ServiceCategory"; oldj jsonb; newj jsonb;
BEGIN
 IF TG_OP='INSERT' AND current_user='convyn_marketplace' THEN NEW.created_by_id=marketplace.require_actor(); NEW.created_date=now(); END IF;
 IF TG_OP='UPDATE' AND current_user='convyn_marketplace' THEN
  IF NEW.created_by_id IS DISTINCT FROM OLD.created_by_id OR NEW.created_date IS DISTINCT FROM OLD.created_date OR NEW.id<>OLD.id THEN RAISE EXCEPTION 'Ownership cannot change' USING ERRCODE='42501'; END IF;
 END IF;
 IF TG_TABLE_NAME='ServiceRequest' THEN
  SELECT * INTO c FROM marketplace."ServiceCategory" WHERE slug=NEW.category_slug;
  IF TG_OP='INSERT' THEN
   NEW.customer_email=marketplace.actor_email();
   NEW.customer_name=marketplace.actor_name();
  END IF;
  NEW.category_name=c.name;
  IF current_user='convyn_marketplace' THEN
   IF TG_OP='UPDATE' AND OLD.status NOT IN ('draft','open') THEN RAISE EXCEPTION 'This request is locked' USING ERRCODE='23514'; END IF;
   IF NEW.status NOT IN ('draft','open','cancelled') THEN RAISE EXCEPTION 'Use the booking workflow' USING ERRCODE='23514'; END IF;
   IF TG_OP='UPDATE' AND (NEW.accepted_bid_id IS DISTINCT FROM OLD.accepted_bid_id OR NEW.booking_id IS DISTINCT FROM OLD.booking_id OR NEW.bid_count<>OLD.bid_count OR NEW.customer_email<>OLD.customer_email) THEN RAISE EXCEPTION 'Protected request fields' USING ERRCODE='42501'; END IF;
   IF NOT marketplace.check_uploads(NEW.attachments,'requests') THEN RAISE EXCEPTION 'Invalid private attachment' USING ERRCODE='42501'; END IF;
  END IF;
  IF NEW.status='open' THEN
   IF NOT c.active OR length(NEW.address)<3 OR length(NEW.customer_phone)<8 THEN RAISE EXCEPTION 'Active service, address and phone are required' USING ERRCODE='23514'; END IF;
   IF NEW.urgency='scheduled' AND (NEW.scheduled_for IS NULL OR NEW.scheduled_for<=now()) THEN RAISE EXCEPTION 'Choose a future scheduled date' USING ERRCODE='23514'; END IF;
   IF NEW.urgency='emergency' AND NOT c.emergency_supported THEN RAISE EXCEPTION 'This service does not support emergencies' USING ERRCODE='23514'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='ProviderProfile' THEN
  IF TG_OP='INSERT' THEN NEW.user_email=marketplace.actor_email(); END IF;
  IF current_user='convyn_marketplace' AND NOT marketplace.is_admin() THEN
   IF TG_OP='INSERT' AND (NEW.verification_status NOT IN ('draft','submitted') OR NEW.rating_avg<>0 OR NEW.jobs_completed<>0 OR NEW.reviews_count<>0 OR NEW.verification_notes<>'') THEN RAISE EXCEPTION 'Protected provider fields' USING ERRCODE='42501'; END IF;
   IF TG_OP='UPDATE' THEN
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status AND NOT (OLD.verification_status IN ('draft','more_info','rejected') AND NEW.verification_status='submitted') THEN RAISE EXCEPTION 'Only an administrator can review verification' USING ERRCODE='42501'; END IF;
    IF NEW.user_email<>OLD.user_email OR NEW.rating_avg<>OLD.rating_avg OR NEW.reviews_count<>OLD.reviews_count OR NEW.jobs_completed<>OLD.jobs_completed OR NEW.verification_notes<>OLD.verification_notes OR NEW.on_time_rate<>OLD.on_time_rate OR NEW.response_minutes<>OLD.response_minutes THEN RAISE EXCEPTION 'Protected provider fields' USING ERRCODE='42501'; END IF;
    IF (NEW.documents<>OLD.documents OR NEW.category_slugs<>OLD.category_slugs OR NEW.registration_number<>OLD.registration_number) AND OLD.verification_status='approved' THEN NEW.verification_status='submitted'; NEW.availability='offline'; END IF;
   END IF;
   IF NOT marketplace.check_uploads(NEW.documents,'documents') THEN RAISE EXCEPTION 'Invalid private document' USING ERRCODE='42501'; END IF;
   IF NEW.availability='busy' AND (TG_OP='INSERT' OR OLD.availability<>'busy') THEN RAISE EXCEPTION 'Busy state is managed by bookings' USING ERRCODE='42501'; END IF;
   IF NEW.availability='online' AND NEW.verification_status<>'approved' THEN RAISE EXCEPTION 'Approval is required to go online' USING ERRCODE='23514'; END IF;
  END IF;
  IF EXISTS(SELECT FROM unnest(NEW.category_slugs) slug WHERE NOT EXISTS(SELECT FROM marketplace."ServiceCategory" c WHERE c.slug=slug)) THEN RAISE EXCEPTION 'Unknown category' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='PlatformSetting' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(NEW.weights))<>8 OR EXISTS(SELECT FROM jsonb_each_text(NEW.weights) w WHERE w.key NOT IN ('skills','ratings','experience','credentials','reliability','location','response','recommendations') OR w.value !~ '^[0-9]+$') OR (SELECT sum(value::integer) FROM jsonb_each_text(NEW.weights))<>100 THEN RAISE EXCEPTION 'The eight scoring weights must total 100' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_request BEFORE INSERT OR UPDATE ON marketplace."ServiceRequest" FOR EACH ROW EXECUTE FUNCTION marketplace.guard_entity();
CREATE TRIGGER guard_provider BEFORE INSERT OR UPDATE ON marketplace."ProviderProfile" FOR EACH ROW EXECUTE FUNCTION marketplace.guard_entity();
CREATE TRIGGER guard_setting BEFORE INSERT OR UPDATE ON marketplace."PlatformSetting" FOR EACH ROW EXECUTE FUNCTION marketplace.guard_entity();
CREATE FUNCTION marketplace.record_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
DECLARE rowj jsonb; recipient record;
BEGIN
 rowj=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 PERFORM marketplace.audit(lower(TG_OP),TG_TABLE_NAME,(rowj->>'id')::uuid,jsonb_build_object('status',rowj->>'status','verification_status',rowj->>'verification_status'));
 IF TG_TABLE_NAME='ProviderProfile' AND TG_OP='UPDATE' AND rowj->>'verification_status' IS DISTINCT FROM to_jsonb(OLD)->>'verification_status' THEN
  PERFORM marketplace.notify(NEW.user_email,'Verification updated',NEW.verification_status,'verification','/provider/onboarding');
 ELSIF TG_TABLE_NAME='ServiceRequest' AND TG_OP<>'DELETE' AND rowj->>'status'='open' AND (TG_OP='INSERT' OR to_jsonb(OLD)->>'status' IS DISTINCT FROM rowj->>'status') THEN
  FOR recipient IN SELECT user_email FROM marketplace."ProviderProfile" p WHERE p.verification_status='approved' AND p.availability='online' AND NEW.category_slug=ANY(p.category_slugs) AND marketplace.distance_km(p.latitude,p.longitude,NEW.latitude,NEW.longitude)<=p.service_radius_km AND (NEW.urgency<>'emergency' OR p.emergency_available) LOOP
   PERFORM marketplace.notify(recipient.user_email,'New service opportunity',NEW.category_name||' in '||NEW.city,'opportunity','/provider');
  END LOOP;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON marketplace."ServiceCategory" FOR EACH ROW EXECUTE FUNCTION marketplace.record_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON marketplace."ProviderProfile" FOR EACH ROW EXECUTE FUNCTION marketplace.record_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON marketplace."ServiceRequest" FOR EACH ROW EXECUTE FUNCTION marketplace.record_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON marketplace."Bid" FOR EACH ROW EXECUTE FUNCTION marketplace.record_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON marketplace."Booking" FOR EACH ROW EXECUTE FUNCTION marketplace.record_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON marketplace."Review" FOR EACH ROW EXECUTE FUNCTION marketplace.record_change();
CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON marketplace."PlatformSetting" FOR EACH ROW EXECUTE FUNCTION marketplace.record_change();
INSERT INTO marketplace."ServiceCategory"(name,slug,blurb,callout_fee_cents,hourly_rate_cents,emergency_supported,sort_order) VALUES('Electrical','electrical','Faults, DB boards, wiring, certification of compliance.',69000,48000,true,1);
INSERT INTO marketplace."ServiceCategory"(name,slug,blurb,callout_fee_cents,hourly_rate_cents,emergency_supported,sort_order) VALUES('Plumbing','plumbing','Burst pipes, geysers, blocked drains, leak detection.',59000,42000,true,2);
INSERT INTO marketplace."ServiceCategory"(name,slug,blurb,callout_fee_cents,hourly_rate_cents,emergency_supported,sort_order) VALUES('Locksmith & Access','locksmith','Lockouts, car keys, safes, gate and door hardware.',45000,38000,true,3);
INSERT INTO marketplace."ServiceCategory"(name,slug,blurb,callout_fee_cents,hourly_rate_cents,emergency_supported,sort_order) VALUES('Appliance Repair','appliance-repair','Washing machines, fridges, ovens, dishwashers.',52000,36000,false,4);
INSERT INTO marketplace."ServiceCategory"(name,slug,blurb,callout_fee_cents,hourly_rate_cents,emergency_supported,sort_order) VALUES('Heating & Cooling','hvac','Air-conditioning installs, servicing and gas refills.',74000,51000,false,5);
INSERT INTO marketplace."ServiceCategory"(name,slug,blurb,callout_fee_cents,hourly_rate_cents,emergency_supported,sort_order) VALUES('Handyman & Repairs','handyman','Mounting, carpentry, patching, small builds.',39000,31000,false,6);
INSERT INTO marketplace."ServiceCategory"(name,slug,blurb,callout_fee_cents,hourly_rate_cents,emergency_supported,sort_order) VALUES('Cleaning','cleaning','Deep cleans, move-outs, carpets, post-construction.',42000,29000,false,7);
INSERT INTO marketplace."ServiceCategory"(name,slug,blurb,callout_fee_cents,hourly_rate_cents,emergency_supported,sort_order) VALUES('Towing & Recovery','towing-recovery','Breakdowns, jump starts, flat tyres, accident recovery.',85000,55000,true,8);
INSERT INTO marketplace."ServiceCategory"(name,slug,blurb,callout_fee_cents,hourly_rate_cents,emergency_supported,sort_order) VALUES('IT & Network','it-support','Wi-Fi, cabling, CCTV, devices and on-site support.',62000,44000,false,9);
INSERT INTO marketplace."PlatformSetting"(key) VALUES('config');
CREATE FUNCTION marketplace.actor_name() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ SELECT concat("firstName",' ',"lastName") FROM public."User" WHERE id=marketplace.actor_id() $$;
CREATE FUNCTION marketplace."submitBid"(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
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
 INSERT INTO marketplace."Bid"(created_by_id,request_id,request_reference,category_slug,customer_user_id,provider_profile_id,provider_name,provider_user_email,price_cents,callout_fee_cents,labour_cents,materials_cents,travel_cents,after_hours_cents,eta_minutes,duration_minutes,warranty_days,valid_until,comments,pricing_version)
 VALUES(p.created_by_id,r.id,r.reference,r.category_slug,r.created_by_id,p.id,p.display_name,p.user_email,(input->>'price_cents')::bigint,(input->>'callout_fee_cents')::bigint,(input->>'labour_cents')::bigint,(input->>'materials_cents')::bigint,(input->>'travel_cents')::bigint,(input->>'after_hours_cents')::bigint,(input->>'eta_minutes')::integer,(input->>'duration_minutes')::integer,coalesce((input->>'warranty_days')::integer,0),(input->>'valid_until')::timestamptz,coalesce(input->>'comments',''),cfg.pricing_version)
 ON CONFLICT(request_id,provider_profile_id) DO UPDATE SET price_cents=excluded.price_cents,callout_fee_cents=excluded.callout_fee_cents,labour_cents=excluded.labour_cents,materials_cents=excluded.materials_cents,travel_cents=excluded.travel_cents,after_hours_cents=excluded.after_hours_cents,eta_minutes=excluded.eta_minutes,duration_minutes=excluded.duration_minutes,warranty_days=excluded.warranty_days,valid_until=excluded.valid_until,comments=excluded.comments,status='submitted',score=NULL,score_breakdown=NULL,score_explanation=NULL,scoring_version=NULL,pricing_version=excluded.pricing_version RETURNING * INTO b;
 UPDATE marketplace."ServiceRequest" SET bid_count=(SELECT count(*) FROM marketplace."Bid" WHERE request_id=r.id AND status='submitted') WHERE id=r.id;
 PERFORM marketplace.notify(r.customer_email,'New quote received',p.display_name||' quoted on '||r.reference,'quote','/requests/'||r.id);
 RETURN to_jsonb(b);
END $$;
CREATE FUNCTION marketplace."acceptBid"(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
DECLARE r marketplace."ServiceRequest"; b marketplace."Bid"; p marketplace."ProviderProfile"; c marketplace."ServiceCategory"; cfg marketplace."PlatformSetting"; job marketplace."Booking"; pct integer; fee bigint; other record;
BEGIN
 PERFORM marketplace.require_actor();
 SELECT request_id INTO b.request_id FROM marketplace."Bid" WHERE id=(input->>'bid_id')::uuid;
 SELECT * INTO r FROM marketplace."ServiceRequest" WHERE id=b.request_id FOR UPDATE;
 IF NOT FOUND OR r.created_by_id<>marketplace.actor_id() THEN RAISE EXCEPTION 'Only the request customer can accept a quote' USING ERRCODE='42501'; END IF;
 IF r.status<>'open' THEN RAISE EXCEPTION 'This request has already been awarded or closed' USING ERRCODE='23505'; END IF;
 SELECT * INTO b FROM marketplace."Bid" WHERE id=(input->>'bid_id')::uuid FOR UPDATE;
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
CREATE FUNCTION marketplace."completeBooking"(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
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
  UPDATE marketplace."ProviderProfile" SET jobs_completed=jobs_completed+1,availability='online',on_time_rate=round(100.0*(SELECT count(*) FROM marketplace."Booking" j JOIN marketplace."Bid" b ON b.id=j.bid_id WHERE j.provider_profile_id=p.id AND j.status='closed' AND EXISTS(SELECT FROM jsonb_array_elements(j.timeline) t WHERE t->>'status'='arrived' AND (t->>'at')::timestamptz<=j.created_date+make_interval(mins=>b.eta_minutes)))/(jobs_completed+1)) WHERE id=p.id;
 END IF;
 PERFORM marketplace.notify(CASE WHEN input->>'action'='close' THEN p.user_email ELSE job.customer_email END,'Booking updated',job.reference||': '||replace(next_status,'_',' '),'booking','/bookings');
 RETURN to_jsonb(job);
END $$;
CREATE FUNCTION marketplace."scoreBids"(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
DECLARE r marketplace."ServiceRequest"; cfg marketplace."PlatformSetting"; b record; features jsonb; parts jsonb; k text; value numeric; score numeric; dist float8; version text;
BEGIN
 PERFORM marketplace.require_actor();
 SELECT * INTO r FROM marketplace."ServiceRequest" WHERE id=(input->>'request_id')::uuid FOR UPDATE;
 IF NOT FOUND OR (r.created_by_id<>marketplace.actor_id() AND NOT marketplace.is_admin()) THEN RAISE EXCEPTION 'Request access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM marketplace."PlatformSetting" WHERE key='config'; version='scoring-v1-'||substr(md5(cfg.weights::text),1,12);
 FOR b IN SELECT q.id AS bid_id,p.* FROM marketplace."Bid" q JOIN marketplace."ProviderProfile" p ON p.id=q.provider_profile_id WHERE q.request_id=r.id AND q.status='submitted' AND q.valid_until>now() LOOP
  dist=marketplace.distance_km(b.latitude,b.longitude,r.latitude,r.longitude);
  features=jsonb_build_object('skills',CASE WHEN r.category_slug=ANY(b.category_slugs) THEN 100 ELSE 0 END,'ratings',b.rating_avg*20,'experience',least(100,b.jobs_completed*2),'credentials',CASE WHEN b.verification_status='approved' THEN 100 ELSE 0 END,'reliability',b.on_time_rate,'location',greatest(0,100-dist/b.service_radius_km*100),'response',greatest(0,100-b.response_minutes::numeric/60*100),'recommendations',least(100,b.reviews_count*5));
  score=0; parts='{}';
  FOR k,value IN SELECT key,(value::text)::numeric FROM jsonb_each(features) LOOP
   score=score+value*(cfg.weights->>k)::numeric/100;
   parts=parts||jsonb_build_object(k,jsonb_build_object('value',round(value,2),'weight',(cfg.weights->>k)::integer,'contribution',round(value*(cfg.weights->>k)::numeric/100,2)));
  END LOOP;
  UPDATE marketplace."Bid" SET score=round(score,2),score_breakdown=parts,scoring_version=version,score_explanation=format('This quote scores %s out of 100 using the current published weights. The provider has %s completed jobs, %s reviews and a rating of %s out of 5, and is %s km from the job. Verification, service-category match, recorded arrival reliability and response time also contribute. This is guidance; compare the quote details before choosing.',round(score,2),b.jobs_completed,b.reviews_count,b.rating_avg,round(dist::numeric,1)) WHERE id=b.bid_id;
 END LOOP;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY score DESC NULLS LAST,price_cents,created_date) FROM marketplace."Bid" q WHERE request_id=r.id AND status='submitted' AND valid_until>now()),'[]');
END $$;
CREATE FUNCTION marketplace."listOpportunities"(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
DECLARE p marketplace."ProviderProfile";
BEGIN
 PERFORM marketplace.require_actor();
 SELECT * INTO p FROM marketplace."ProviderProfile" WHERE id=(input->>'provider_profile_id')::uuid AND created_by_id=marketplace.actor_id();
 IF NOT FOUND OR p.verification_status<>'approved' THEN RAISE EXCEPTION 'Approved provider access required' USING ERRCODE='42501'; END IF;
 IF p.availability<>'online' THEN RETURN '[]'; END IF;
 RETURN coalesce((SELECT jsonb_agg(v ORDER BY (v->>'distance')::float8) FROM (SELECT jsonb_build_object('id',r.id,'reference',r.reference,'category_slug',r.category_slug,'category_name',r.category_name,'description',r.description,'suburb',r.suburb,'city',r.city,'urgency',r.urgency,'scheduled_for',r.scheduled_for,'budget_hint_cents',r.budget_hint_cents,'status',r.status,'created_date',r.created_date,'distance',round(marketplace.distance_km(p.latitude,p.longitude,r.latitude,r.longitude)::numeric,1),'age',greatest(0,extract(epoch FROM now()-r.created_date)::bigint)) v FROM marketplace."ServiceRequest" r WHERE r.status='open' AND r.created_by_id<>p.created_by_id AND r.category_slug=ANY(p.category_slugs) AND marketplace.distance_km(p.latitude,p.longitude,r.latitude,r.longitude)<=p.service_radius_km AND (r.scheduled_for IS NULL OR r.scheduled_for>now()) AND (r.urgency<>'emergency' OR p.emergency_available) AND NOT EXISTS(SELECT FROM marketplace."Bid" b WHERE b.request_id=r.id AND b.provider_profile_id=p.id)) rows),'[]');
END $$;
CREATE FUNCTION marketplace."reviewProviderVerification"(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
DECLARE p marketplace."ProviderProfile"; next_status text;
BEGIN
 IF NOT marketplace.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
 next_status=CASE input->>'decision' WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' WHEN 'more_info' THEN 'more_info' END;
 IF next_status IS NULL OR length(coalesce(input->>'notes','')) NOT BETWEEN 1 AND 3000 THEN RAISE EXCEPTION 'Decision and notes are required' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM marketplace."ProviderProfile" WHERE id=(input->>'provider_profile_id')::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Provider not found' USING ERRCODE='P0002'; END IF;
 IF p.verification_status NOT IN ('submitted','under_review','more_info','approved','suspended') THEN RAISE EXCEPTION 'Provider must submit verification first' USING ERRCODE='23514'; END IF;
 UPDATE marketplace."ProviderProfile" SET verification_status=next_status,verification_notes=input->>'notes',availability=CASE WHEN next_status='approved' THEN 'online' ELSE 'offline' END WHERE id=p.id RETURNING * INTO p;
 RETURN to_jsonb(p);
END $$;
CREATE FUNCTION marketplace."createReview"(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
DECLARE job marketplace."Booking"; review marketplace."Review";
BEGIN
 PERFORM marketplace.require_actor();
 SELECT * INTO job FROM marketplace."Booking" WHERE id=(input->>'booking_id')::uuid FOR UPDATE;
 IF NOT FOUND OR job.created_by_id<>marketplace.actor_id() THEN RAISE EXCEPTION 'Only the booking customer can review' USING ERRCODE='42501'; END IF;
 IF job.status<>'closed' OR NOT job.customer_confirmed THEN RAISE EXCEPTION 'Confirm completion before reviewing' USING ERRCODE='23514'; END IF;
 INSERT INTO marketplace."Review"(created_by_id,booking_id,provider_profile_id,provider_name,customer_name,customer_email,rating,comment,tags) VALUES(marketplace.actor_id(),job.id,job.provider_profile_id,job.provider_name,job.customer_name,job.customer_email,(input->>'rating')::integer,input->>'comment',ARRAY(SELECT jsonb_array_elements_text(coalesce(input->'tags','[]')))) RETURNING * INTO review;
 UPDATE marketplace."Booking" SET rating=review.rating,review_id=review.id WHERE id=job.id;
 PERFORM marketplace.notify(job.provider_user_email,'New customer review',job.reference||' received a review.','review','/provider');
 RETURN to_jsonb(review);
END $$;
CREATE FUNCTION marketplace.refresh_rating() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
DECLARE profile uuid;
BEGIN
 profile=CASE WHEN TG_OP='DELETE' THEN OLD.provider_profile_id ELSE NEW.provider_profile_id END;
 UPDATE marketplace."ProviderProfile" SET rating_avg=coalesce((SELECT round(avg(rating),2) FROM marketplace."Review" WHERE provider_profile_id=profile),0),reviews_count=(SELECT count(*) FROM marketplace."Review" WHERE provider_profile_id=profile) WHERE id=profile;
 IF TG_OP='UPDATE' THEN UPDATE marketplace."Booking" SET rating=NEW.rating WHERE id=NEW.booking_id;
 ELSIF TG_OP='DELETE' THEN UPDATE marketplace."Booking" SET rating=NULL,review_id=NULL WHERE id=OLD.booking_id; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER refresh_rating AFTER INSERT OR UPDATE OR DELETE ON marketplace."Review" FOR EACH ROW EXECUTE FUNCTION marketplace.refresh_rating();
CREATE FUNCTION marketplace.guard_review() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.booking_id<>OLD.booking_id OR NEW.provider_profile_id<>OLD.provider_profile_id OR NEW.created_by_id<>OLD.created_by_id OR NEW.customer_email<>OLD.customer_email THEN RAISE EXCEPTION 'Review ownership and booking cannot change' USING ERRCODE='42501'; END IF; RETURN NEW; END $$;
CREATE TRIGGER guard_review BEFORE UPDATE ON marketplace."Review" FOR EACH ROW EXECUTE FUNCTION marketplace.guard_review();
CREATE FUNCTION marketplace."withdrawBid"(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
DECLARE b marketplace."Bid"; r marketplace."ServiceRequest";
BEGIN
 PERFORM marketplace.require_actor();
 SELECT * INTO b FROM marketplace."Bid" WHERE id=(input->>'bid_id')::uuid;
 IF NOT FOUND OR b.created_by_id<>marketplace.actor_id() THEN RAISE EXCEPTION 'Quote access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM marketplace."ServiceRequest" WHERE id=b.request_id FOR UPDATE;
 IF r.status<>'open' OR b.status<>'submitted' THEN RAISE EXCEPTION 'This quote cannot be withdrawn' USING ERRCODE='23514'; END IF;
 UPDATE marketplace."Bid" SET status='withdrawn' WHERE id=b.id RETURNING * INTO b;
 UPDATE marketplace."ServiceRequest" SET bid_count=(SELECT count(*) FROM marketplace."Bid" WHERE request_id=r.id AND status='submitted') WHERE id=r.id;
 PERFORM marketplace.notify(r.customer_email,'Quote withdrawn',b.provider_name||' withdrew a quote.','quote','/requests/'||r.id);
 RETURN to_jsonb(b);
END $$;
CREATE FUNCTION marketplace."cancelBooking"(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
DECLARE job marketplace."Booking";
BEGIN
 PERFORM marketplace.require_actor(); SELECT * INTO job FROM marketplace."Booking" WHERE id=(input->>'booking_id')::uuid FOR UPDATE;
 IF NOT FOUND OR (NOT marketplace.actor_id()=ANY(job.members) AND NOT marketplace.is_admin()) THEN RAISE EXCEPTION 'Booking access denied' USING ERRCODE='42501'; END IF;
 IF job.status NOT IN ('confirmed','en_route','arrived') THEN RAISE EXCEPTION 'This booking cannot be cancelled' USING ERRCODE='23514'; END IF;
 UPDATE marketplace."Booking" SET status='cancelled',timeline=timeline||jsonb_build_array(jsonb_build_object('status','cancelled','at',now(),'by',marketplace.actor_id())) WHERE id=job.id RETURNING * INTO job;
 UPDATE marketplace."ServiceRequest" SET status='cancelled' WHERE id=job.request_id;
 UPDATE marketplace."ProviderProfile" SET availability='online' WHERE id=job.provider_profile_id;
 PERFORM marketplace.notify(job.customer_email,'Booking cancelled',job.reference,'booking','/bookings');
 PERFORM marketplace.notify(job.provider_user_email,'Booking cancelled',job.reference,'booking','/bookings');
 RETURN to_jsonb(job);
END $$;
CREATE FUNCTION marketplace.public_providers() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$ SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'provider_type',provider_type,'business_name',business_name,'bio',bio,'skills',skills,'category_slugs',category_slugs,'city',city,'suburb',suburb,'availability',availability,'emergency_available',emergency_available,'hourly_rate_cents',hourly_rate_cents,'callout_fee_cents',callout_fee_cents,'verification_status',verification_status,'rating_avg',rating_avg,'reviews_count',reviews_count,'jobs_completed',jobs_completed,'on_time_rate',on_time_rate,'response_minutes',response_minutes,'member_since',member_since)),'[]') FROM marketplace."ProviderProfile" WHERE verification_status='approved' $$;
CREATE FUNCTION marketplace.public_ticker() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$ SELECT coalesce(jsonb_agg(t),'[]') FROM (SELECT category_name,city,urgency,created_date FROM marketplace."ServiceRequest" WHERE status='open' ORDER BY created_date DESC LIMIT 12) t $$;
CREATE FUNCTION marketplace.can_read_file(file_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$ SELECT EXISTS(SELECT FROM marketplace."PrivateUpload" f WHERE f.id=file_id AND (marketplace.is_admin() OR f.created_by_id=marketplace.actor_id() OR (f.bucket<>'documents' AND EXISTS(SELECT FROM marketplace."Booking" b JOIN marketplace."ServiceRequest" r ON r.id=b.request_id WHERE marketplace.actor_id()=ANY(b.members) AND (r.attachments @> jsonb_build_array(f.uri) OR b.evidence @> jsonb_build_array(f.uri)))))) $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA marketplace FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketplace.actor_id(),marketplace.actor_email(),marketplace.actor_name(),marketplace.is_admin(),marketplace.require_actor(),marketplace.check_uploads(jsonb,text) TO convyn_marketplace;
GRANT EXECUTE ON FUNCTION marketplace."submitBid"(jsonb),marketplace."acceptBid"(jsonb),marketplace."completeBooking"(jsonb),marketplace."scoreBids"(jsonb),marketplace."listOpportunities"(jsonb),marketplace."reviewProviderVerification"(jsonb),marketplace."createReview"(jsonb),marketplace."withdrawBid"(jsonb),marketplace."cancelBooking"(jsonb),marketplace.public_providers(),marketplace.public_ticker(),marketplace.can_read_file(uuid) TO convyn_marketplace;
