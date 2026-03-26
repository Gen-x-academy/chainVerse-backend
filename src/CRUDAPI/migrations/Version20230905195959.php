<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Auto-generated Migration: Please modify to your needs!
 */
final class Version20230905195959 extends AbstractMigration
{
    public function getDescription(): string
    {
        return '';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE SEQUENCE symphony_id_seq INCREMENT BY 1 MINVALUE 1 START 1');
        $this->addSql('CREATE TABLE symphony (id INT NOT NULL, composer_id INT NOT NULL, name VARCHAR(255) NOT NULL, description TEXT DEFAULT NULL, created_at DATE DEFAULT NULL, finished_at DATE DEFAULT NULL, PRIMARY KEY(id))');
        $this->addSql('CREATE INDEX IDX_1C0BFCE97A8D2620 ON symphony (composer_id)');
        $this->addSql('COMMENT ON COLUMN symphony.created_at IS \'(DC2Type:date_immutable)\'');
        $this->addSql('COMMENT ON COLUMN symphony.finished_at IS \'(DC2Type:date_immutable)\'');
        $this->addSql('ALTER TABLE symphony ADD CONSTRAINT FK_1C0BFCE97A8D2620 FOREIGN KEY (composer_id) REFERENCES composer (id) NOT DEFERRABLE INITIALLY IMMEDIATE');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('CREATE SCHEMA public');
        $this->addSql('DROP SEQUENCE symphony_id_seq CASCADE');
        $this->addSql('ALTER TABLE symphony DROP CONSTRAINT FK_1C0BFCE97A8D2620');
        $this->addSql('DROP TABLE symphony');
    }
}
