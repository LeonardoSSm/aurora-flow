import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Os nomes de arquivo com acento foram gravados como UTF-8 lido em Latin-1 ("endereço" virou
 * "endereÃ§o"), o mesmo defeito que AttachmentsService corrige agora no upload. Refaz a leitura
 * dos nomes que têm a marca disso (Â ou Ã); um nome que não vire UTF-8 válido fica como está.
 * O down não desfaz: os nomes corrigidos são os certos.
 */
export class FixAttachmentFileNameEncoding1790200000000 implements MigrationInterface {
  name = 'FixAttachmentFileNameEncoding1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: { id: string; original_name: string }[] = await queryRunner.query(
      `SELECT "id", "original_name" FROM "attachments" WHERE "original_name" ~ '[ÂÃ]'`,
    );
    for (const row of rows) {
      const fixed = decodeLatin1AsUtf8(row.original_name);
      if (fixed === row.original_name) continue;
      await queryRunner.query(`UPDATE "attachments" SET "original_name" = $1 WHERE "id" = $2`, [fixed, row.id]);
    }
  }

  public async down(): Promise<void> {
    // Sem volta: ver o comentário da classe.
  }
}

function decodeLatin1AsUtf8(name: string): string {
  if (/[^\u0000-ÿ]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}
