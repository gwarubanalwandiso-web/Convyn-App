-- Reapply after disaster recovery as well as initial role provisioning.
GRANT convyn_marketplace TO convyn_app;
GRANT USAGE ON SCHEMA marketplace TO convyn_marketplace;
GRANT SELECT ON ALL TABLES IN SCHEMA marketplace TO convyn_marketplace;
REVOKE ALL ON marketplace."PasswordRecovery",marketplace."Invitation",marketplace."OAuthIdentity",marketplace."EmailDelivery",marketplace."ProviderCapacity" FROM convyn_marketplace;
GRANT INSERT,UPDATE,DELETE ON marketplace."ServiceCategory",marketplace."ProviderProfile",marketplace."ServiceRequest",marketplace."Notification",marketplace."PlatformSetting" TO convyn_marketplace;
GRANT UPDATE,DELETE ON marketplace."Review" TO convyn_marketplace;
GRANT INSERT ON marketplace."PrivateUpload" TO convyn_marketplace;
REVOKE ALL ON marketplace."AuditLog" FROM convyn_marketplace;
GRANT SELECT ON marketplace."AuditLog" TO convyn_marketplace;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA marketplace FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marketplace.actor_id(),marketplace.actor_email(),marketplace.actor_name(),marketplace.is_admin(),marketplace.require_actor(),marketplace.check_uploads(jsonb,text),marketplace."submitBid"(jsonb),marketplace."acceptBid"(jsonb),marketplace."completeBooking"(jsonb),marketplace."scoreBids"(jsonb),marketplace."listOpportunities"(jsonb),marketplace."reviewProviderVerification"(jsonb),marketplace."createReview"(jsonb),marketplace."withdrawBid"(jsonb),marketplace."cancelBooking"(jsonb),marketplace.public_providers(),marketplace.public_ticker(),marketplace.can_read_file(uuid),marketplace.record_account_audit(uuid,text,jsonb),marketplace.broadcast_message(jsonb),marketplace.provider_is_suspended(uuid) TO convyn_marketplace;
GRANT SELECT,INSERT,UPDATE,DELETE ON marketplace."PasswordRecovery",marketplace."Invitation",marketplace."OAuthIdentity",marketplace."EmailDelivery" TO convyn_app;
GRANT EXECUTE ON FUNCTION marketplace.expire_quotes() TO convyn_app;
