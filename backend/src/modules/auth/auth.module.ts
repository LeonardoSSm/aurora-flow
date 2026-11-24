import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { GoogleWorkspaceModule } from '../google-workspace/google-workspace.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { RefreshTokenModule } from './refresh-token.module';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    GoogleWorkspaceModule,
    RefreshTokenModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN'),
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy, LoginRateLimitService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
