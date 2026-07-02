import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async changePassword(userId: string, data: ChangePasswordDto) {
    if (data.newPassword !== data.confirmPassword) {
      throw new BadRequestException('La confirmación no coincide');
    }

    if (data.currentPassword === data.newPassword) {
      throw new BadRequestException(
        'La nueva contraseña debe ser distinta a la actual',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      data.currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return { message: 'Contraseña actualizada correctamente' };
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, name: true, isActive: true, role: true },
    });
  }

  async inviteUser(data: { email: string; name: string; roleId: string }) {
    // Generar contrase\u00f1a temporal
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: hashedPassword,
        roleId: data.roleId,
      },
    });

    // Aqu\u00ed ir\u00eda el env\u00edo de mail con tempPassword
    return { ...user, tempPassword }; // Solo para demo, en prod no retornar el password
  }

  async toggleStatus(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error('Usuario no encontrado');

    return this.prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
    });
  }
}
