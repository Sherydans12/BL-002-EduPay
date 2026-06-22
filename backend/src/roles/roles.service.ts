import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.role.findMany({ include: { permissions: true } });
  }

  async findAllPermissions() {
    return this.prisma.permission.findMany();
  }

  async create(data: { name: string; permissionIds: string[] }) {
    return this.prisma.role.create({
      data: {
        name: data.name,
        permissions: {
          connect: data.permissionIds.map((id) => ({ id })),
        },
      },
    });
  }

  async update(id: string, data: { name: string; permissionIds: string[] }) {
    return this.prisma.role.update({
      where: { id },
      data: {
        name: data.name,
        permissions: {
          set: data.permissionIds.map((permId) => ({ id: permId })),
        },
      },
    });
  }
}
