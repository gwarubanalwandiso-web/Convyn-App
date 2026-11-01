-- Private file metadata is visible only after the file access predicate succeeds.
ALTER POLICY owned ON marketplace."PrivateUpload" USING(created_by_id=marketplace.actor_id() OR marketplace.is_admin() OR marketplace.can_read_file(id));
ALTER TABLE marketplace."Booking" DROP CONSTRAINT "Booking_review_id_fkey";
ALTER TABLE marketplace."Booking" ADD FOREIGN KEY(review_id) REFERENCES marketplace."Review"(id) ON DELETE SET NULL;
CREATE FUNCTION marketplace.record_account_audit(target uuid,action text,detail jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,marketplace AS $$ BEGIN IF NOT marketplace.is_admin() AND target<>marketplace.actor_id() THEN RAISE EXCEPTION 'Account access denied' USING ERRCODE='42501'; END IF; IF action NOT IN ('role_change','account_update','password_reset') THEN RAISE EXCEPTION 'Unknown account action' USING ERRCODE='23514'; END IF; PERFORM marketplace.audit(action,'User',target,detail); END $$;
REVOKE ALL ON FUNCTION marketplace.record_account_audit(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketplace.record_account_audit(uuid,text,jsonb) TO convyn_marketplace;
CREATE TABLE marketplace."Invitation"(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_date timestamptz NOT NULL DEFAULT now(),updated_date timestamptz NOT NULL DEFAULT now(),created_by_id uuid REFERENCES public."User"(id),email text NOT NULL,role text NOT NULL CHECK(role IN ('CUSTOMER','PROVIDER','ADMIN')),token_hash text NOT NULL UNIQUE,expires_at timestamptz NOT NULL,redeemed_at timestamptz);
ALTER TABLE marketplace."Invitation" ENABLE ROW LEVEL SECURITY;
CREATE TABLE marketplace."OAuthIdentity"(provider text NOT NULL,subject text NOT NULL,user_id uuid NOT NULL REFERENCES public."User"(id),PRIMARY KEY(provider,subject));
ALTER TABLE marketplace."OAuthIdentity" ENABLE ROW LEVEL SECURITY;
-- These internal records are available only to trusted auth service functions, never the public entity API.
CREATE POLICY auth_owner ON marketplace."PasswordRecovery" FOR ALL TO PUBLIC USING(current_user='convyn_app') WITH CHECK(current_user='convyn_app');
CREATE POLICY invites_owner ON marketplace."Invitation" FOR ALL TO PUBLIC USING(current_user='convyn_app') WITH CHECK(current_user='convyn_app');
CREATE POLICY oauth_owner ON marketplace."OAuthIdentity" FOR ALL TO PUBLIC USING(current_user='convyn_app') WITH CHECK(current_user='convyn_app');
DO $$ BEGIN IF EXISTS(SELECT FROM pg_roles WHERE rolname='convyn_app') THEN GRANT SELECT,INSERT,UPDATE,DELETE ON marketplace."PasswordRecovery",marketplace."Invitation",marketplace."OAuthIdentity" TO convyn_app; GRANT convyn_marketplace TO convyn_app; END IF; END $$;
