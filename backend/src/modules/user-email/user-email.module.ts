import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormFieldEntity, FormVersionEntity, UserEntity } from '../../database/entities';
import { UserEmailFieldService } from './user-email-field.service';

/** Campo "E-mail de usuário": sugestões no preenchimento e trava "só e-mails sugeridos". */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, FormVersionEntity, FormFieldEntity])],
  controllers: [],
  providers: [UserEmailFieldService],
  exports: [UserEmailFieldService],
})
export class UserEmailModule {}
