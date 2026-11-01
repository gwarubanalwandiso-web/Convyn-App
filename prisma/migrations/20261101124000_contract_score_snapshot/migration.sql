CREATE OR REPLACE FUNCTION marketplace."scoreBids"(input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$
DECLARE r marketplace."ServiceRequest"; cfg marketplace."PlatformSetting"; b record; features jsonb; parts jsonb; k text; value numeric; computed_score numeric; dist float8; version text;
BEGIN
 PERFORM marketplace.require_actor();
 SELECT * INTO r FROM marketplace."ServiceRequest" WHERE id=(input->>'request_id')::uuid FOR UPDATE;
 IF NOT FOUND OR (r.created_by_id<>marketplace.actor_id() AND NOT marketplace.is_admin()) THEN RAISE EXCEPTION 'Request access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO cfg FROM marketplace."PlatformSetting" WHERE key='config'; version='scoring-v1-'||substr(md5(cfg.weights::text),1,12);
 FOR b IN SELECT q.id AS bid_id,p.* FROM marketplace."Bid" q JOIN marketplace."ProviderProfile" p ON p.id=q.provider_profile_id WHERE q.request_id=r.id AND q.status='submitted' AND q.valid_until>now() LOOP
  dist=marketplace.distance_km(b.latitude,b.longitude,r.latitude,r.longitude);
  features=jsonb_build_object('skills',CASE WHEN r.category_slug=ANY(b.category_slugs) THEN 100 ELSE 0 END,'ratings',b.rating_avg*20,'experience',least(100,b.jobs_completed*2),'credentials',CASE WHEN b.verification_status='approved' THEN 100 ELSE 0 END,'reliability',b.on_time_rate,'location',greatest(0,100-dist/b.service_radius_km*100),'response',greatest(0,100-b.response_minutes::numeric/60*100),'recommendations',least(100,b.reviews_count*5));
  computed_score=0; parts='{}';
  FOR k,value IN SELECT feature.key,(feature.value::text)::numeric FROM jsonb_each(features) AS feature LOOP
   computed_score=computed_score+value*(cfg.weights->>k)::numeric/100;
   parts=parts||jsonb_build_object(k,jsonb_build_object('value',round(value,2),'weight',(cfg.weights->>k)::integer,'contribution',round(value*(cfg.weights->>k)::numeric/100,2)));
  END LOOP;
  UPDATE marketplace."Bid" SET score=round(computed_score,2),score_breakdown=parts,scoring_version=version,score_explanation=format('This quote scores %s out of 100 using the current published weights. The provider has %s completed jobs, %s reviews and a rating of %s out of 5, and is %s km from the job. Verification, service-category match, recorded arrival reliability and response time also contribute. This is guidance; compare the quote details before choosing.',round(computed_score,2),b.jobs_completed,b.reviews_count,b.rating_avg,round(dist::numeric,1)) WHERE id=b.bid_id;
 END LOOP;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.score DESC NULLS LAST,q.price_cents,q.created_date) FROM marketplace."Bid" q WHERE request_id=r.id AND status='submitted' AND valid_until>now()),'[]');
END $$;
