import { Controller, Get, Post, Body, Param, Put, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions('view:roles')
  findAll() {
    return this.rolesService.findAll();
  }

  @Get('permissions')
  @RequirePermissions('view:roles')
  findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }

  @Post()
  @RequirePermissions('manage:roles')
  create(@Body() data: { name: string; permissionIds: string[] }) {
    return this.rolesService.create(data);
  }

  @Put(':id')
  @RequirePermissions('manage:roles')
  update(@Param('id') id: string, @Body() data: { name: string; permissionIds: string[] }) {
    return this.rolesService.update(id, data);
  }
}
