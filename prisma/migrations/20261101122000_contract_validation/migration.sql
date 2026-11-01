-- Explicit variable qualification keeps validation and scoring unambiguous.
CREATE OR REPLACE FUNCTION marketplace.guard_entity() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,marketplace,public AS $$
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
  IF EXISTS(SELECT FROM unnest(NEW.category_slugs) AS selected(slug) WHERE NOT EXISTS(SELECT FROM marketplace."ServiceCategory" c WHERE c.slug=selected.slug)) THEN RAISE EXCEPTION 'Unknown category' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='PlatformSetting' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(NEW.weights))<>8 OR EXISTS(SELECT FROM jsonb_each_text(NEW.weights) w WHERE w.key NOT IN ('skills','ratings','experience','credentials','reliability','location','response','recommendations') OR w.value !~ '^[0-9]+$') OR (SELECT sum(value::integer) FROM jsonb_each_text(NEW.weights))<>100 THEN RAISE EXCEPTION 'The eight scoring weights must total 100' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION marketplace."scoreBids"(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
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
  FOR k,value IN SELECT feature.key,(feature.value::text)::numeric FROM jsonb_each(features) AS feature LOOP
   score=score+value*(cfg.weights->>k)::numeric/100;
   parts=parts||jsonb_build_object(k,jsonb_build_object('value',round(value,2),'weight',(cfg.weights->>k)::integer,'contribution',round(value*(cfg.weights->>k)::numeric/100,2)));
  END LOOP;
  UPDATE marketplace."Bid" SET score=round(score,2),score_breakdown=parts,scoring_version=version,score_explanation=format('This quote scores %s out of 100 using the current published weights. The provider has %s completed jobs, %s reviews and a rating of %s out of 5, and is %s km from the job. Verification, service-category match, recorded arrival reliability and response time also contribute. This is guidance; compare the quote details before choosing.',round(score,2),b.jobs_completed,b.reviews_count,b.rating_avg,round(dist::numeric,1)) WHERE id=b.bid_id;
 END LOOP;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY score DESC NULLS LAST,price_cents,created_date) FROM marketplace."Bid" q WHERE request_id=r.id AND status='submitted' AND valid_until>now()),'[]');
END $$;
