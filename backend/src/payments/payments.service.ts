import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { FilterPaymentsDto } from './dto/filter-payments.dto';
import { Prisma } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { buildWorkbook } from '../common/excel/excel.helper';
import { formatPaymentCalendarDateEsCl } from '../common/format-payment-calendar-date';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  DEBIT: 'Débito',
  CREDIT: 'Crédito',
  CHECK: 'Cheque',
  TRANSFER: 'Transferencia',
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreatePaymentDto, boletaFileUrl?: string) {
    const payment = await this.prisma.payment.create({
      data: {
        amount: dto.amount,
        method: dto.method,
        paymentDate: new Date(dto.paymentDate),
        studentId: dto.studentId,
        conceptId: dto.conceptId || null,
        payerName: dto.payerName || null,
        payerRut: dto.payerRut || null,
        referenceCode: dto.referenceCode || null,
        notes: dto.notes || null,
        boletaNumber: dto.boletaNumber || null,
        boletaFileUrl: boletaFileUrl || null,
      },
      include: {
        student: { include: { course: true, guardian: true } },
        concept: true,
      },
    });

    const guardianEmail = payment.student.guardian.email?.trim();
    if (guardianEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail)) {
      await this.mailService.sendPaymentConfirmation({
        to: guardianEmail,
        studentName: payment.student.name,
        amount: payment.amount,
        paymentDate: payment.paymentDate,
        boletaFileUrl: payment.boletaFileUrl,
      });
    }

    return payment;
  }

  async findAll(filters: FilterPaymentsDto) {
    const { dateFrom, dateTo, courseId, studentId, page = 1, limit = 50 } = filters;

    const where: Prisma.PaymentWhereInput = {};

    // Filtro por rango de fechas
    if (dateFrom || dateTo) {
      where.paymentDate = {};
      if (dateFrom) where.paymentDate.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.paymentDate.lte = end;
      }
    }

    // Filtro por curso (a través de Student)
    if (courseId) {
      where.student = { courseId };
    }

    // Filtro por alumno
    if (studentId) {
      where.studentId = studentId;
    }

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        orderBy: { paymentDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          student: { include: { course: true, guardian: true } },
          concept: true,
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        student: { include: { course: true, guardian: true } },
        concept: true,
      },
    });
    if (!payment) throw new NotFoundException(`Payment #${id} not found`);
    return payment;
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.payment.delete({ where: { id } });
  }

  /** Genera buffer XLSX con todos los pagos que cumplan los filtros (sin paginación) */
  async exportToXlsx(filters: FilterPaymentsDto): Promise<Buffer> {
    const { dateFrom, dateTo, courseId, studentId } = filters;

    const where: Prisma.PaymentWhereInput = {};
    if (dateFrom || dateTo) {
      where.paymentDate = {};
      if (dateFrom) where.paymentDate.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.paymentDate.lte = end;
      }
    }
    if (courseId) where.student = { courseId };
    if (studentId) where.studentId = studentId;

    const data = await this.prisma.payment.findMany({
      where,
      orderBy: { paymentDate: 'desc' },
      include: {
        student: { include: { course: true, guardian: true } },
        concept: true,
      },
    });

    const rows = data.map((p) => ({
      id: p.id,
      fecha: formatPaymentCalendarDateEsCl(p.paymentDate),
      alumno: p.student.name,
      rutAlumno: p.student.rut,
      curso: p.student.course.name,
      monto: p.amount,
      metodo: METHOD_LABELS[p.method] ?? p.method,
      concepto: p.concept?.name ?? '',
      pagador: p.payerName ?? 'Apoderado',
      rutPagador: p.payerRut ?? '',
      boleta: p.boletaNumber ?? '',
      referencia: p.referenceCode ?? '',
      notas: p.notes ?? '',
    }));

    return buildWorkbook('Pagos', [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Alumno', key: 'alumno', width: 32 },
      { header: 'RUT Alumno', key: 'rutAlumno', width: 16 },
      { header: 'Curso', key: 'curso', width: 20 },
      { header: 'Monto', key: 'monto', width: 15, numFmt: '"$"#,##0' },
      { header: 'Método', key: 'metodo', width: 16 },
      { header: 'Concepto', key: 'concepto', width: 22 },
      { header: 'Pagador', key: 'pagador', width: 30 },
      { header: 'RUT Pagador', key: 'rutPagador', width: 16 },
      { header: 'N° Boleta', key: 'boleta', width: 16 },
      { header: 'Referencia', key: 'referencia', width: 22 },
      { header: 'Notas', key: 'notas', width: 32 },
    ], rows);
  }

  /** Resumen agrupado por curso */
  async summaryByCourse(dateFrom?: string, dateTo?: string) {
    const where: Prisma.PaymentWhereInput = {};
    if (dateFrom || dateTo) {
      where.paymentDate = {};
      if (dateFrom) where.paymentDate.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.paymentDate.lte = end;
      }
    }

    const payments = await this.prisma.payment.findMany({
      where,
      include: { student: { include: { course: true } } },
    });

    const grouped: Record<string, { courseName: string; total: number; count: number }> = {};
    for (const p of payments) {
      const key = p.student.course.id.toString();
      if (!grouped[key]) {
        grouped[key] = { courseName: p.student.course.name, total: 0, count: 0 };
      }
      grouped[key].total += p.amount;
      grouped[key].count += 1;
    }

    return Object.entries(grouped).map(([courseId, data]) => ({
      courseId: Number(courseId),
      ...data,
    }));
  }
}
