-- CreateTable
CREATE TABLE "ScoringRule" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "weights" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoringRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "components" JSONB NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScoringRule_version_key" ON "ScoringRule"("version");

-- CreateIndex
CREATE INDEX "Recommendation_requestId_createdAt_idx" ON "Recommendation"("requestId", "createdAt");
CREATE UNIQUE INDEX "ScoringRule_one_active" ON "ScoringRule" (active) WHERE active;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_score_valid" CHECK (score BETWEEN 0 AND 100);
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_request_fkey" FOREIGN KEY ("requestId") REFERENCES "ServiceRequest"(id) ON DELETE RESTRICT;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_provider_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"(id) ON DELETE RESTRICT;
CREATE INDEX "ProviderProfile_location_gist" ON "ProviderProfile" USING gist ((ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography));
