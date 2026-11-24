import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PERMISSION_CODES, SYSTEM_PERMISSION_CODES } from '../../common/constants/permission-catalog';
import { RoleEntity, RolePermissionEntity, UserEntity } from '../../database/entities';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UsersService } from '../users/users.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { RolePermissionEntryDto } from './dto/role-permission-entry.dto';
import { RoleDetailResponseDto, RoleResponseDto } from './dto/role-response.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PermissionsService } from './permissions.service';

/**
 * Permissões que algum perfil sempre tem de manter: sem `roles.manage` ninguém mais muda perfis; sem
 * `processes.full_access` ninguém mais enxerga um processo de que não é membro (nem para socorrer um
 * processo cujo dono saiu da empresa).
 */
const CRITICAL_PERMISSIONS: ReadonlyArray<{ code: string; message: string }> = [
  { code: 'roles.manage', message: 'Pelo menos um perfil deve manter a permissão de gerenciar perfis ("roles.manage").' },
  {
    code: 'processes.full_access',
    message: 'Pelo menos um perfil deve manter o acesso total aos processos ("processes.full_access").',
  },
];

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly rolesRepository: Repository<RoleEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionsRepository: Repository<RolePermissionEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    private readonly usersService: UsersService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async findAll(): Promise<RoleResponseDto[]> {
    const roles = await this.rolesRepository.find({
      relations: { permissions: true },
      order: { createdAt: 'ASC' },
    });

    const counts = await Promise.all(
      roles.map(async (role) => {
        const [userCount, activeUserCount] = await this.countUsers(role.code);
        return { role, userCount, activeUserCount };
      }),
    );

    return counts.map(({ role, userCount, activeUserCount }) =>
      RoleResponseDto.from(role, userCount, activeUserCount),
    );
  }

  /** Lista leve (código + nome) para seletores de UI — sem o mapa de permissões, que é o dado sensível de /roles. Não exige `roles.manage`. */
  async findAllOptions(): Promise<{ code: string; name: string }[]> {
    const roles = await this.rolesRepository.find({ order: { name: 'ASC' } });
    return roles.map((role) => ({ code: role.code, name: role.name }));
  }

  async findOne(code: string): Promise<RoleDetailResponseDto> {
    const role = await this.findRoleOrFail(code);

    const users = await this.usersRepository.find({
      select: { id: true, fullName: true, email: true, isActive: true, lastLoginAt: true },
      where: { role: code },
      order: { fullName: 'ASC' },
    });

    return RoleDetailResponseDto.fromWithUsers(role, users);
  }

  async create(dto: CreateRoleDto): Promise<RoleResponseDto> {
    const existing = await this.rolesRepository.findOne({ where: { code: dto.code } });
    if (existing) {
      throw new BadRequestException(`Já existe um perfil com o código "${dto.code}".`);
    }

    this.assertValidPermissionEntries(dto.permissions ?? []);

    const role = this.rolesRepository.create({
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      color: dto.color ?? 'gray',
      isSystem: false,
    });
    await this.rolesRepository.save(role);

    if (dto.permissions && dto.permissions.length > 0) {
      await this.replacePermissions(dto.code, dto.permissions);
    }

    this.permissionsService.invalidate(dto.code);
    return this.findAndReturn(dto.code);
  }

  async update(code: string, dto: UpdateRoleDto): Promise<RoleResponseDto> {
    const role = await this.findRoleOrFail(code);

    if (dto.name !== undefined) role.name = dto.name;
    if (dto.description !== undefined) role.description = dto.description;
    if (dto.color !== undefined) role.color = dto.color;

    await this.rolesRepository.save(role);
    return this.findAndReturn(code);
  }

  async updatePermissions(
    code: string,
    permissions: RolePermissionEntryDto[],
  ): Promise<RoleResponseDto> {
    await this.findRoleOrFail(code);
    this.assertValidPermissionEntries(permissions);
    await this.assertRolesManageCapabilitySurvives(code, permissions);

    await this.replacePermissions(code, permissions);
    this.permissionsService.invalidate(code);
    return this.findAndReturn(code);
  }

  async remove(code: string): Promise<void> {
    await this.findRoleOrFail(code);

    const userCount = await this.usersRepository.count({ where: { role: code } });
    if (userCount > 0) {
      throw new BadRequestException(
        `Não é possível excluir o perfil "${code}": ${userCount} usuário(s) ainda o utilizam. Reatribua-os primeiro.`,
      );
    }

    await this.assertRolesManageCapabilitySurvives(code);

    await this.rolesRepository.delete({ code });
    this.permissionsService.invalidate(code);
  }

  async updateUserRole(userId: string, newRoleCode: string): Promise<UserResponseDto> {
    const role = await this.rolesRepository.findOne({ where: { code: newRoleCode } });
    if (!role) {
      throw new BadRequestException(`Perfil "${newRoleCode}" não encontrado.`);
    }

    return this.usersService.update(userId, { role: newRoleCode });
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async findRoleOrFail(code: string): Promise<RoleEntity> {
    const role = await this.rolesRepository.findOne({
      where: { code },
      relations: { permissions: true },
    });
    if (!role) {
      throw new NotFoundException(`Perfil "${code}" não encontrado.`);
    }
    return role;
  }

  private async findAndReturn(code: string): Promise<RoleResponseDto> {
    const role = await this.findRoleOrFail(code);
    const [userCount, activeUserCount] = await this.countUsers(code);
    return RoleResponseDto.from(role, userCount, activeUserCount);
  }

  private countUsers(code: string): Promise<[number, number]> {
    return Promise.all([
      this.usersRepository.count({ where: { role: code } }),
      this.usersRepository.count({ where: { role: code, isActive: true } }),
    ]);
  }

  private assertValidPermissionEntries(entries: RolePermissionEntryDto[]): void {
    for (const entry of entries) {
      if (!PERMISSION_CODES.has(entry.code)) {
        throw new BadRequestException(`Código de permissão desconhecido: "${entry.code}".`);
      }
    }
  }

  private async replacePermissions(
    roleCode: string,
    entries: RolePermissionEntryDto[],
  ): Promise<void> {
    // Troca só o que a tela de perfis gerencia (os códigos de sistema) e o que veio na requisição. As
    // linhas antigas de processo (forms.view, solicitations.view…) ficam: o código novo não as lê, mas
    // são elas que o código anterior usa se o deploy precisar ser desfeito.
    const managed = [...new Set([...SYSTEM_PERMISSION_CODES, ...entries.map((entry) => entry.code)])];
    await this.rolePermissionsRepository.delete({ roleId: roleCode, permissionCode: In(managed) });
    const grants = entries
      .filter((entry) => entry.scope !== 'none')
      .map((entry) =>
        this.rolePermissionsRepository.create({
          roleId: roleCode,
          permissionCode: entry.code,
          scope: entry.scope,
        }),
      );
    if (grants.length > 0) {
      await this.rolePermissionsRepository.save(grants);
    }
  }

  /**
   * Safety rail: the system must never end up with zero roles holding a critical permission
   * (CRITICAL_PERMISSIONS) at a scope other than 'none'. Checked before deleting a role or replacing
   * a role's permission set.
   */
  private async assertRolesManageCapabilitySurvives(
    mutatedRoleCode: string,
    newPermissionsForMutatedRole?: RolePermissionEntryDto[],
  ): Promise<void> {
    for (const critical of CRITICAL_PERMISSIONS) {
      const otherRolesCount = await this.countOtherRolesWith(critical.code, mutatedRoleCode);

      let mutatedRoleStillGrants = false;
      if (newPermissionsForMutatedRole) {
        const entry = newPermissionsForMutatedRole.find((p) => p.code === critical.code);
        mutatedRoleStillGrants = entry ? entry.scope !== 'none' : false;
      }

      if (otherRolesCount === 0 && !mutatedRoleStillGrants) {
        // Base que nunca teve quem detenha a permissão (ex.: antes da migration): a trava não se aplica.
        if (!(await this.someRoleHolds(critical.code))) continue;
        throw new BadRequestException(critical.message);
      }
    }
  }

  private async countOtherRolesWith(code: string, excludeRoleCode: string): Promise<number> {
    const grants = await this.rolePermissionsRepository.find({ where: { permissionCode: code } });
    return grants.filter((g) => g.scope !== 'none' && g.roleId !== excludeRoleCode).length;
  }

  private async someRoleHolds(code: string): Promise<boolean> {
    const grants = await this.rolePermissionsRepository.find({ where: { permissionCode: code } });
    return grants.some((g) => g.scope !== 'none');
  }
}
