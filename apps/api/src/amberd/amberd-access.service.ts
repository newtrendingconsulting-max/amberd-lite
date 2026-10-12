import { ForbiddenException, Injectable } from '@nestjs/common';
import { OrgRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';

/**
 * Role checks and audit logging shared by every Amberd Lite service.
 *
 * As in ProjectsService, the role is resolved against the organization id from
 * the route before any decision is made.
 */
@Injectable()
export class AmberdAccessService {
  static readonly MEMBER_ROLES: OrgRole[] = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.MEMBER];
  static readonly MANAGER_ROLES: OrgRole[] = [OrgRole.OWNER, OrgRole.ADMIN];

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async requireMember(userId: string, organizationId: string): Promise<OrgRole> {
    return this.requireRole(userId, organizationId, AmberdAccessService.MEMBER_ROLES, 'access');
  }

  async requireManager(userId: string, organizationId: string, action: string): Promise<OrgRole> {
    return this.requireRole(userId, organizationId, AmberdAccessService.MANAGER_ROLES, action);
  }

  async log(
    organizationId: string,
    actorId: string | null,
    level: 'info' | 'warn' | 'error',
    category: string,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.platformLog.create({
      data: {
        organizationId,
        actorId,
        level,
        category,
        message,
        data: (data ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  private async requireRole(
    userId: string,
    organizationId: string,
    allowed: OrgRole[],
    action: string,
  ): Promise<OrgRole> {
    const role = await this.organizationsService.getUserRoleInOrganization(userId, organizationId);
    if (!role || !allowed.includes(role as OrgRole)) {
      throw new ForbiddenException(`You do not have permission to ${action} in this organization`);
    }
    return role as OrgRole;
  }
}
