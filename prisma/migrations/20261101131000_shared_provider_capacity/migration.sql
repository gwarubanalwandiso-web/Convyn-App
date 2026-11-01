-- One shared reservation prevents double-booking across the retained and updated applications.
CREATE TABLE marketplace."ProviderCapacity"(user_id uuid PRIMARY KEY REFERENCES public."User"(id) ON DELETE CASCADE,booking_id uuid NOT NULL,source text NOT NULL CHECK(source IN ('public','marketplace')),UNIQUE(source,booking_id));
ALTER TABLE marketplace."ProviderCapacity" ENABLE ROW LEVEL SECURITY;
INSERT INTO marketplace."ProviderCapacity"(user_id,booking_id,source) SELECT p."userId",b.id,'public' FROM public."Booking" b JOIN public."Bid" q ON q.id=b."bidId" JOIN public."ProviderProfile" p ON p.id=q."providerId" WHERE b.status NOT IN ('COMPLETED','CANCELLED');
INSERT INTO marketplace."ProviderCapacity"(user_id,booking_id,source) SELECT p.created_by_id,b.id,'marketplace' FROM marketplace."Booking" b JOIN marketplace."ProviderProfile" p ON p.id=b.provider_profile_id WHERE b.status NOT IN ('closed','cancelled');
CREATE FUNCTION marketplace.reserve_provider_capacity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace,public AS $$
DECLARE provider_user uuid; terminal boolean; inserted integer;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN DELETE FROM marketplace."ProviderCapacity" WHERE source=TG_TABLE_SCHEMA AND booking_id=OLD.id; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF TG_TABLE_SCHEMA='public' THEN
  terminal=NEW.status::text IN ('COMPLETED','CANCELLED');
  IF NOT terminal THEN SELECT p."userId" INTO provider_user FROM public."Bid" q JOIN public."ProviderProfile" p ON p.id=q."providerId" WHERE q.id=NEW."bidId"; END IF;
 ELSE
  terminal=NEW.status IN ('closed','cancelled');
  IF NOT terminal THEN SELECT created_by_id INTO provider_user FROM marketplace."ProviderProfile" WHERE id=NEW.provider_profile_id; END IF;
 END IF;
 IF NOT terminal THEN
  INSERT INTO marketplace."ProviderCapacity"(user_id,booking_id,source) VALUES(provider_user,NEW.id,TG_TABLE_SCHEMA) ON CONFLICT(user_id) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  IF inserted<>1 THEN RAISE EXCEPTION 'Provider already has an active booking' USING ERRCODE='23505'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER shared_provider_capacity AFTER INSERT OR UPDATE OR DELETE ON public."Booking" FOR EACH ROW EXECUTE FUNCTION marketplace.reserve_provider_capacity();
CREATE TRIGGER shared_provider_capacity AFTER INSERT OR UPDATE OR DELETE ON marketplace."Booking" FOR EACH ROW EXECUTE FUNCTION marketplace.reserve_provider_capacity();
REVOKE ALL ON marketplace."ProviderCapacity" FROM PUBLIC,convyn_marketplace;
REVOKE ALL ON FUNCTION marketplace.reserve_provider_capacity() FROM PUBLIC;
