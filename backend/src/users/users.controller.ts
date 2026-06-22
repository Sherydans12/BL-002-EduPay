import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('view:users')
  findAll() {
    return this.usersService.findAll();
  }

  @Post('invite')
  @RequirePermissions('manage:users')
  inviteUser(@Body() createUserDto: any) {
    return this.usersService.inviteUser(createUserDto);
  }

  @Patch(':id/toggle')
  @RequirePermissions('manage:users')
  toggleStatus(@Param('id') id: string) {
    return this.usersService.toggleStatus(id);
  }
}
