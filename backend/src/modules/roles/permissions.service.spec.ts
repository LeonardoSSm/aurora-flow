import { PermissionsService } from './permissions.service';

function makeService(grants: Array<{ roleId: string; permissionCode: string; scope: string }>) {
  const repo = {
    find: jest.fn().mockImplementation(({ where: { roleId } }: { where: { roleId: string } }) =>
      Promise.resolve(grants.filter((g) => g.roleId === roleId)),
    ),
  };
  const service = new PermissionsService(repo as never);
  return { service, repo };
}

describe('PermissionsService', () => {
  it('resolves the granted scope for a role+permission pair', async () => {
    const { service } = makeService([
      { roleId: 'manager', permissionCode: 'forms.view', scope: 'area' },
    ]);

    await expect(service.getScope('manager', 'forms.view')).resolves.toBe('area');
  });

  it('defaults to "none" when no grant row exists', async () => {
    const { service } = makeService([]);

    await expect(service.getScope('viewer', 'roles.manage')).resolves.toBe('none');
  });

  it('hasAny is false for "none" and true for any other scope', async () => {
    const { service } = makeService([
      { roleId: 'editor', permissionCode: 'forms.view', scope: 'own' },
    ]);

    await expect(service.hasAny('editor', 'forms.view')).resolves.toBe(true);
    await expect(service.hasAny('editor', 'forms.publish')).resolves.toBe(false);
  });

  it('caches per role — repeated lookups for the same role only hit the repository once', async () => {
    const { service, repo } = makeService([
      { roleId: 'admin', permissionCode: 'forms.view', scope: 'all' },
    ]);

    await service.getScope('admin', 'forms.view');
    await service.getScope('admin', 'forms.create');
    await service.getScope('admin', 'forms.view');

    expect(repo.find).toHaveBeenCalledTimes(1);
  });

  it('invalidate(roleCode) clears only that role\'s cache entry', async () => {
    const grants = [{ roleId: 'editor', permissionCode: 'forms.view', scope: 'own' }];
    const { service, repo } = makeService(grants);

    await service.getScope('editor', 'forms.view');
    expect(repo.find).toHaveBeenCalledTimes(1);

    service.invalidate('editor');
    await service.getScope('editor', 'forms.view');
    expect(repo.find).toHaveBeenCalledTimes(2);
  });

  it('invalidate() with no argument clears the whole cache', async () => {
    const grants = [
      { roleId: 'editor', permissionCode: 'forms.view', scope: 'own' },
      { roleId: 'viewer', permissionCode: 'forms.view', scope: 'area' },
    ];
    const { service, repo } = makeService(grants);

    await service.getScope('editor', 'forms.view');
    await service.getScope('viewer', 'forms.view');
    expect(repo.find).toHaveBeenCalledTimes(2);

    service.invalidate();
    await service.getScope('editor', 'forms.view');
    await service.getScope('viewer', 'forms.view');
    expect(repo.find).toHaveBeenCalledTimes(4);
  });

  it('reflects an edited grant after invalidate() is called', async () => {
    const grants = [{ roleId: 'viewer', permissionCode: 'forms.view', scope: 'area' }];
    const { service } = makeService(grants);

    await expect(service.getScope('viewer', 'forms.view')).resolves.toBe('area');

    grants[0].scope = 'all';
    service.invalidate('viewer');

    await expect(service.getScope('viewer', 'forms.view')).resolves.toBe('all');
  });
});
