import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRenditionAccessTokens1727190000000
  implements MigrationInterface
{
  name = 'CreateRenditionAccessTokens1727190000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rendition_access_tokens" (
        "id"          uuid          NOT NULL DEFAULT gen_random_uuid(),
        "tokenHash"   varchar(64)   NOT NULL,
        "patronId"    uuid          NOT NULL,
        "loanId"      uuid          NOT NULL,
        "renditionId" uuid          NOT NULL,
        "purpose"     varchar(32)   NOT NULL,
        "expiresAt"   TIMESTAMPTZ   NOT NULL,
        "usedAt"      TIMESTAMPTZ,
        "createdAt"   TIMESTAMPTZ   NOT NULL DEFAULT now(),

        CONSTRAINT "PK_rendition_access_tokens"
          PRIMARY KEY ("id"),

        CONSTRAINT "UQ_rendition_access_tokens_token_hash"
          UNIQUE ("tokenHash")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_rendition_access_tokens_loan"
        ON "rendition_access_tokens" ("loanId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_rendition_access_tokens_patron"
        ON "rendition_access_tokens" ("patronId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_rendition_access_tokens_rendition"
        ON "rendition_access_tokens" ("renditionId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_rendition_access_tokens_expiry"
        ON "rendition_access_tokens" ("expiresAt")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_rendition_access_tokens_expiry"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_rendition_access_tokens_rendition"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_rendition_access_tokens_patron"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_rendition_access_tokens_loan"`,
    );
    await queryRunner.query(`DROP TABLE "rendition_access_tokens"`);
  }
}
