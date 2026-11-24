import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshTokenEntity } from '../../database/entities';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([RefreshTokenEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.getOrThrow<string>('JWT_REFRESH_SECRET'),
        signOptions: {
          expiresIn: cfg.getOrThrow<string>('JWT_REFRESH_EXPIRES_IN'),
        },
      }),
    }),
  ],
  providers: [RefreshTokenService],
  exports: [RefreshTokenService],
})
export class RefreshTokenModule {}
