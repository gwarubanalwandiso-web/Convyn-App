CREATE OR REPLACE FUNCTION marketplace."listOpportunities"(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
DECLARE p marketplace."ProviderProfile";
BEGIN
 PERFORM marketplace.require_actor();
 SELECT * INTO p FROM marketplace."ProviderProfile" WHERE id=(input->>'provider_profile_id')::uuid AND created_by_id=marketplace.actor_id();
 IF NOT FOUND OR p.verification_status<>'approved' OR marketplace.provider_is_suspended(p.created_by_id) THEN RAISE EXCEPTION 'Approved provider access required' USING ERRCODE='42501'; END IF;
 IF p.availability<>'online' THEN RETURN '[]'; END IF;
 RETURN coalesce((SELECT jsonb_agg(v ORDER BY (v->>'distance')::float8) FROM (SELECT jsonb_build_object('id',r.id,'reference',r.reference,'category_slug',r.category_slug,'category_name',r.category_name,'description',r.description,'suburb',r.suburb,'city',r.city,'urgency',r.urgency,'scheduled_for',r.scheduled_for,'budget_hint_cents',r.budget_hint_cents,'attachments',r.attachments,'status',r.status,'created_date',r.created_date,'distance',round(marketplace.distance_km(p.latitude,p.longitude,r.latitude,r.longitude)::numeric,1),'age',greatest(0,extract(epoch FROM now()-r.created_date)::bigint)) v FROM marketplace."ServiceRequest" r WHERE r.status='open' AND r.created_by_id<>p.created_by_id AND r.category_slug=ANY(p.category_slugs) AND marketplace.distance_km(p.latitude,p.longitude,r.latitude,r.longitude)<=p.service_radius_km AND (r.scheduled_for IS NULL OR r.scheduled_for>now()) AND (r.urgency<>'emergency' OR p.emergency_available) AND NOT EXISTS(SELECT FROM marketplace."Bid" b WHERE b.request_id=r.id AND b.provider_profile_id=p.id)) rows),'[]');
END $$;
