import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import {
  SEED_ADMIN_EMAIL,
  SEED_ADMIN_NAME,
  SEED_ADMIN_PASSWORD,
} from '../../common/constants/product';
import { BCRYPT_COST_FACTOR } from '../../common/constants/security.constants';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { RoleEntity, UserEntity } from '../../database/entities';
import { PermissionsService } from '../roles/permissions.service';
import { isProcessPermission, processCodesFor } from '../../common/constants/process-permission-catalog';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(RoleEntity)
    private readonly rolesRepository: Repository<RoleEntity>,
    private readonly permissionsService: PermissionsService,
  ) {}

  private async assertRoleExists(roleCode: string): Promise<void> {
    const exists = await this.rolesRepository.exists({ where: { code: roleCode } });
    if (!exists) {
      throw new BadRequestException(`Perfil "${roleCode}" não encontrado.`);
    }
  }

  // ─── Internal methods for AuthService ──────────────────────────────────────

  _internalFindByEmail(email: string): Promise<UserEntity | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: email.trim().toLowerCase() })
      .getOne();
  }

  _internalFindOneEntity(id: string): Promise<UserEntity | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  _internalFindByIdWithPassword(id: string): Promise<UserEntity | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id })
      .getOne();
  }

  async _internalSetPassword(id: string, passwordHash: string): Promise<void> {
    // A pessoa escolheu a própria senha: um convite pendente perde o sentido e deixaria na caixa de
    // e-mail um link capaz de trocá-la sem a senha atual — então ele deixa de valer aqui.
    await this.usersRepository.update(
      { id },
      { passwordHash, passwordDefinedAt: new Date(), inviteTokenHash: null, inviteExpiresAt: null },
    );
  }

  findActiveById(id: string): Promise<UserEntity | null> {
    return this.usersRepository.findOne({ where: { id, isActive: true } });
  }

  findActiveByEmail(email: string): Promise<UserEntity | null> {
    return this.usersRepository.findOne({
      where: { email: email.trim().toLowerCase(), isActive: true },
    });
  }

  async invalidateAllSessions(userId: string): Promise<void> {
    await this.usersRepository
      .createQueryBuilder()
      .update(UserEntity)
      .set({ tokenVersion: () => 'token_version + 1' })
      .where('id = :id', { id: userId })
      .execute();
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private findEntityByEmail(email: string): Promise<UserEntity | null> {
    return this.usersRepository.findOne({
      where: { email: email.trim().toLowerCase() },
    });
  }

  private async findEntityById(id: string): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({ where: { id }, relations: { area: true } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return user;
  }

  // ─── Cross-module internal (Google / Auth) ──────────────────────────────────

  findByGoogleSub(googleSub: string): Promise<UserEntity | null> {
    return this.usersRepository.findOne({ where: { googleSub } });
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.usersRepository.update({ id }, { lastLoginAt: new Date() });
  }

  /**
   * Pessoas que podem ser escolhidas para algo. Permissão de sistema: pelo perfil. Permissão de
   * processo: quem a tem no vínculo com aquele processo (`formId`), ou em algum processo quando não
   * se diz qual — e quem tem acesso total aos processos.
   */
  async findAssignable(
    assignableAs?: string,
    formId?: string,
  ): Promise<Array<Pick<UserEntity, 'id' | 'fullName' | 'email' | 'role'>>> {
    if (assignableAs && isProcessPermission(assignableAs)) {
      return this.findProcessAssignable(processCodesFor(assignableAs), formId);
    }

    const users = await this.usersRepository.find({
      select: { id: true, fullName: true, email: true, role: true },
      where: { isActive: true },
      order: { fullName: 'ASC' },
    });

    if (!assignableAs) return users;

    const roleCodes = [...new Set(users.map((u) => u.role))];
    const eligibility = new Map(
      await Promise.all(
        roleCodes.map(
          async (role) => [role, await this.permissionsService.hasAny(role, assignableAs)] as const,
        ),
      ),
    );
    return users.filter((u) => eligibility.get(u.role));
  }

  private findProcessAssignable(
    codes: readonly string[],
    formId?: string,
  ): Promise<Array<Pick<UserEntity, 'id' | 'fullName' | 'email' | 'role'>>> {
    const member = [
      'SELECT 1 FROM form_members m',
      codes.length > 0
        ? 'JOIN form_member_permissions p ON p.member_id = m.id AND p.permission_code IN (:...assignableCodes)'
        : '',
      'WHERE m.user_id = user.id',
      formId ? 'AND m.form_id = :assignableFormId' : '',
    ].join(' ');
    return this.usersRepository
      .createQueryBuilder('user')
      .select(['user.id', 'user.fullName', 'user.email', 'user.role'])
      .where('user.is_active = true')
      .andWhere(
        `(EXISTS (${member}) OR EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = user.role AND rp.permission_code = 'processes.full_access' AND rp.scope <> 'none'))`,
        { assignableCodes: codes, assignableFormId: formId },
      )
      .orderBy('user.fullName', 'ASC')
      .getMany();
  }

  // ─── Admin CRUD ─────────────────────────────────────────────────────────────

  async findAll(query: QueryUsersDto): Promise<PaginatedResponseDto<UserResponseDto>> {
    const { page, limit, search, role, isActive } = query;
    const skip = (page - 1) * limit;

    const qb = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.area', 'area');

    if (search) {
      qb.andWhere('(user.full_name ILIKE :search OR user.email ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    if (role) {
      qb.andWhere('user.role = :role', { role });
    }

    if (isActive !== undefined) {
      qb.andWhere('user.is_active = :isActive', { isActive });
    }

    qb.orderBy('user.createdAt', 'DESC').skip(skip).take(limit);

    const [users, total] = await qb.getManyAndCount();
    const dtos = users.map(UserResponseDto.fromEntity);
    return PaginatedResponseDto.of(dtos, total, page, limit);
  }

  async findOne(id: string): Promise<UserResponseDto> {
    const user = await this.findEntityById(id);
    return UserResponseDto.fromEntity(user);
  }

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const existing = await this.findEntityByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Já existe um usuário com este e-mail.');
    }
    await this.assertRoleExists(dto.role);

    // Sem senha = pré-cadastro: grava um hash aleatório (ninguém sabe a senha) e deixa
    // passwordDefinedAt NULL, igual à conta criada pelo login Google. Assim a pessoa já pode
    // ser atribuída antes do primeiro acesso, e o login Google casa pelo e-mail.
    const passwordHash = await bcrypt.hash(
      dto.password ?? randomBytes(24).toString('hex'),
      BCRYPT_COST_FACTOR,
    );
    const user = this.usersRepository.create({
      fullName: dto.fullName,
      email: dto.email,
      passwordHash,
      passwordDefinedAt: dto.password ? new Date() : null,
      role: dto.role,
      areaId: dto.areaId ?? null,
      isActive: true,
    });

    const saved = await this.usersRepository.save(user);
    return UserResponseDto.fromEntity(saved);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.findEntityById(id);

    if (dto.email && dto.email !== user.email) {
      const existing = await this.findEntityByEmail(dto.email);
      if (existing) {
        throw new ConflictException('Já existe um usuário com este e-mail.');
      }
      user.email = dto.email;
    }

    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.areaId !== undefined) user.areaId = dto.areaId ?? null;

    const previousRole = user.role;
    if (dto.role !== undefined) {
      await this.assertRoleExists(dto.role);
      user.role = dto.role;
    }

    const wasActive = user.isActive;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;

    const passwordChanged = Boolean(dto.password);
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST_FACTOR);
      user.passwordDefinedAt = new Date();
    }

    const saved = await this.usersRepository.save(user);

    const shouldInvalidate =
      passwordChanged ||
      (dto.role !== undefined && dto.role !== previousRole) ||
      (wasActive && dto.isActive === false);

    if (shouldInvalidate) {
      await this.invalidateAllSessions(id);
    }

    return UserResponseDto.fromEntity(saved);
  }

  async deactivate(id: string): Promise<UserResponseDto> {
    const user = await this.findEntityById(id);
    user.isActive = false;
    const saved = await this.usersRepository.save(user);
    await this.invalidateAllSessions(id);
    return UserResponseDto.fromEntity(saved);
  }

  // ─── Seed ───────────────────────────────────────────────────────────────────

  async ensureSeedAdmin(): Promise<void> {
    const existing = await this.findEntityByEmail(SEED_ADMIN_EMAIL);
    if (existing) {
      return;
    }

    const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, BCRYPT_COST_FACTOR);
    const admin = this.usersRepository.create({
      fullName: SEED_ADMIN_NAME,
      email: SEED_ADMIN_EMAIL,
      passwordHash,
      passwordDefinedAt: new Date(),
      role: 'admin',
      isActive: true,
    });
    await this.usersRepository.save(admin);
  }
}
