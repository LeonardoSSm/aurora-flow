import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Posicao da secao no canvas do fluxo (aba "Fluxo" do criador de formulario).
 *
 * Antes disso a posicao so existia na memoria do react-flow: arrastar uma
 * secao para organizar o desenho nunca chegava ao formulario salvo, entao
 * sair da tela e voltar sempre devolvia a linha reta padrao. Nula = nunca
 * posicionada a mao, e o front calcula a linha reta de sempre.
 *
 * Coordenadas em pixel (nao grade), porque e a unidade que o react-flow ja
 * usa — nao ha conversao nenhuma entre salvar e desenhar de volta.
 */
export class FormSectionFlowPosition1787300000000 implements MigrationInterface {
  name = 'FormSectionFlowPosition1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form_sections" ADD "flow_position_x" real`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_sections" ADD "flow_position_y" real`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "form_sections" DROP COLUMN "flow_position_y"`);
    await queryRunner.query(`ALTER TABLE "form_sections" DROP COLUMN "flow_position_x"`);
  }
}
