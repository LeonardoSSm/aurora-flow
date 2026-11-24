import { IsEmail, MaxLength } from 'class-validator';

export class CreateLopsAiSessionDto {
  /** E-mail com que a pessoa entrou na LOPS IA (conta do Google Workspace). */
  @IsEmail()
  @MaxLength(180)
  email!: string;
}
