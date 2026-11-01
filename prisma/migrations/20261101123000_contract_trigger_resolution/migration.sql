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
  IF EXISTS(SELECT FROM unnest(NEW.category_slugs) AS selected(slug) WHERE NOT EXISTS(SELECT FROM marketplace."ServiceCategory" category_row WHERE category_row.slug=selected.slug)) THEN RAISE EXCEPTION 'Unknown category' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='PlatformSetting' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(NEW.weights))<>8 OR EXISTS(SELECT FROM jsonb_each_text(NEW.weights) w WHERE w.key NOT IN ('skills','ratings','experience','credentials','reliability','location','response','recommendations') OR w.value !~ '^[0-9]+$') OR (SELECT sum(value::integer) FROM jsonb_each_text(NEW.weights))<>100 THEN RAISE EXCEPTION 'The eight scoring weights must total 100' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
