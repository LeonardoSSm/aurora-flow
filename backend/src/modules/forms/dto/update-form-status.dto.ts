import { IsEnum } from 'class-validator';
import { FormStatus } from '../../../common/enums/form-status.enum';

export class UpdateFormStatusDto {
  @IsEnum(FormStatus)
  status!: FormStatus;
}
