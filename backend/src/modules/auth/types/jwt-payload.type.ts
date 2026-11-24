export type JwtPayload = {
  sub: string;
  email: string;
  fullName: string;
  // Role code — any perfil registrado em `roles`, not just the 4 legacy
  // values. See PermissionsService.getScope() for how this is resolved.
  role: string;
  tokenVersion: number;
  areaId?: string | null;
};
