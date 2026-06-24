const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

/** URL absoluta de un PDF guardado en el backend (boletaFileUrl = `/uploads/…`). */
export function resolveUploadUrl(boletaFileUrl: string): string {
  const base = API_URL.replace(/\/$/, "");
  const path = boletaFileUrl.startsWith("/")
    ? boletaFileUrl
    : `/${boletaFileUrl}`;
  return `${base}${path}`;
}

// ─── Blob Download Helper ─────────────────────────────────────
/**
 * Triggers a browser file download from a Blob object using the DOM trick.
 * Works in all modern browsers; cleans up the object URL after use.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ─── Auth Token Helper ────────────────────────────────────────
/**
 * Extrae el JWT desde la cookie `auth_token`.
 * Protegido contra SSR (typeof document check).
 */
function getAuthToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(^|;\s*)auth_token=([^;]*)/);
  return match ? match[2] : null;
}

// ─── Binary Request Wrapper ───────────────────────────────────
/**
 * Like `request`, but returns a raw Blob for binary responses (e.g. XLSX downloads).
 * Does NOT unwrap the TransformInterceptor envelope — the server sends raw bytes.
 */
async function requestBlob(path: string, options?: RequestInit): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const callerHeaders = options?.headers
    ? Object.fromEntries(
        options.headers instanceof Headers
          ? options.headers.entries()
          : Object.entries(options.headers as Record<string, string>),
      )
    : {};

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...callerHeaders },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = Array.isArray(body.message)
      ? body.message.join(". ")
      : body.message || `Error ${res.status}`;
    throw new Error(msg);
  }

  return res.blob();
}

// ─── Request Wrapper ──────────────────────────────────────────
/**
 * Wrapper global de fetch que:
 * 1. Inyecta `Authorization: Bearer <token>` automáticamente si existe cookie.
 * 2. Inyecta `Content-Type: application/json` salvo para FormData.
 * 3. Parsea errores del GlobalExceptionFilter: { statusCode, message }.
 * 4. Desenvuelve el envelope del TransformInterceptor: { data } → T.
 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  // Construir headers base
  const headers: Record<string, string> = {};

  // JWT automático
  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Content-Type (no para FormData, el browser lo pone con boundary)
  if (!(options?.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  // Merge con headers explícitos del caller (tienen prioridad)
  const callerHeaders = options?.headers
    ? Object.fromEntries(
        options.headers instanceof Headers
          ? options.headers.entries()
          : Object.entries(options.headers as Record<string, string>),
      )
    : {};

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...callerHeaders },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = Array.isArray(body.message)
      ? body.message.join(". ")
      : body.message || `Error ${res.status}`;
    throw new Error(msg);
  }

  const json = await res.json();

  // Desenvolver { data, meta? } del TransformInterceptor
  if (json && typeof json === "object" && "data" in json) {
    if ("meta" in json) return json as T;
    return json.data as T;
  }

  return json as T;
}

// ─── Types ────────────────────────────────────────────────────
export interface Course {
  id: number;
  name: string;
  _count?: { students: number };
}

export interface Guardian {
  id: number;
  rut?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  _count?: { students: number };
  students?: Array<{
    id: number;
    rut: string;
    name: string;
    courseId: number;
    course?: Course;
  }>;
}

export type GuardianPayload = Partial<
  Pick<Guardian, "rut" | "name" | "email" | "phone">
> & {
  studentIds?: number[];
};

/** Respuesta de GET /courses/:id (incluye alumnos activos con apoderado) */
export interface CourseWithStudents extends Course {
  students: Array<{
    id: number;
    rut: string;
    name: string;
    courseId: number;
    guardianId: number;
    guardian: Guardian;
  }>;
}

export type StudentStatus = "ACTIVE" | "INACTIVE" | "GRADUATED";
export type FinancialSetupStatus = "PENDING" | "CONFIGURED";

export interface Student {
  id: number;
  rut: string;
  name: string;
  status: StudentStatus;
  financialSetup: FinancialSetupStatus;
  courseId: number;
  guardianId: number;
  course: Course;
  guardian: Guardian;
}

export interface SetupFinancialPlanDto {
  charges: Array<{ conceptId: number; amount: number; dueDate: string }>;
}

export interface UpdateFinancialPlanDto {
  charges: Array<{
    id?: number;
    conceptId: number;
    amount: number;
    dueDate: string;
  }>;
}

export interface PaymentConcept {
  id: number;
  name: string;
  defaultAmount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export type ChargeStatus =
  | "PENDING"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

export type PaymentMethod = "CASH" | "DEBIT" | "CREDIT" | "CHECK" | "TRANSFER";

export interface Charge {
  id: number;
  studentId: number;
  conceptId: number;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: ChargeStatus;
  notes?: string | null;
  concept: PaymentConcept;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface Payment {
  id: number;
  amount: number;
  method: string;
  paymentDate: string;
  studentId: number;
  student: Student;
  paymentGroupId?: number | null;
  paymentGroup?: Pick<
    PaymentGroup,
    "id" | "boletaFileUrl" | "boletaNumber" | "notes" | "totalAmount"
  > | null;
  conceptId?: number | null;
  concept?: PaymentConcept | null;
  payerName?: string;
  payerRut?: string;
  referenceCode?: string;
  notes?: string;
  boletaFileUrl?: string;
  boletaNumber?: string;
  createdAt: string;
  deletedAt?: string | null;
}

export interface PaymentGroup {
  id: number;
  totalAmount: number;
  method: string;
  paymentDate: string;
  boletaFileUrl?: string | null;
  boletaNumber?: string | null;
  isBoletaPending: boolean;
  notes?: string | null;
  payments: Payment[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export type NotificationType =
  | "BOLETA_DELIVERY"
  | "PAYMENT_RECEIPT"
  | "COBRANZA_PREVENTIVA"
  | "COBRANZA_MORA";

export type NotificationStatus = "PENDING" | "SENT" | "FAILED";

export interface NotificationLog {
  id: number;
  type: NotificationType;
  status: NotificationStatus;
  recipientEmail: string;
  subject: string;
  body: string;
  errorMessage?: string | null;
  studentId?: number | null;
  student?: Student | null;
  paymentGroupId?: number | null;
  paymentGroup?: PaymentGroup | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface NotificationLogFilters {
  page?: number;
  limit?: number;
  search?: string;
  status?: NotificationStatus;
  type?: NotificationType;
}

export type AccountStatementPayment = Omit<Payment, "paymentGroup"> & {
  paymentGroup?: Pick<
    PaymentGroup,
    | "id"
    | "totalAmount"
    | "method"
    | "paymentDate"
    | "boletaFileUrl"
    | "boletaNumber"
    | "isBoletaPending"
    | "notes"
    | "createdAt"
    | "updatedAt"
    | "deletedAt"
  > | null;
};

export interface StudentAccountStatement {
  summary: {
    totalInvoiced: number;
    totalPaid: number;
    totalOverdue: number;
  };
  charges: Charge[];
  payments: AccountStatementPayment[];
  logs: NotificationLog[];
}

/** Serializa el payload de pago agrupado para POST /payments/batch (multipart). */
export function buildPaymentBatchFormData(data: {
  totalAmount: number;
  method: string;
  paymentDate: string;
  allocations: Array<{
    studentId: number;
    conceptId: number;
    amount: number;
    chargeId?: number;
  }>;
  boletaNumber?: string;
  isBoletaPending?: boolean;
  notes?: string;
  boleta?: File;
}): FormData {
  const fd = new FormData();
  fd.append("totalAmount", String(data.totalAmount));
  fd.append("method", data.method);
  fd.append("paymentDate", data.paymentDate);
  fd.append(
    "allocations",
    JSON.stringify(
      data.allocations.map((a) => ({
        studentId: a.studentId,
        conceptId: a.conceptId,
        amount: a.amount,
        ...(a.chargeId ? { chargeId: a.chargeId } : {}),
      })),
    ),
  );
  if (data.boletaNumber?.trim())
    fd.append("boletaNumber", data.boletaNumber.trim());
  if (data.isBoletaPending) fd.append("isBoletaPending", "true");
  if (data.notes?.trim()) fd.append("notes", data.notes.trim());
  if (data.boleta) fd.append("boleta", data.boleta);
  return fd;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    /** Listados de cursos, alumnos, apoderados */
    lastPage?: number;
    /** Pagos u otros listados */
    totalPages?: number;
  };
}

export interface CourseSummary {
  courseId: number;
  courseName: string;
  total: number;
  count: number;
}

// ─── Courses ──────────────────────────────────────────────────
export const coursesApi = {
  getAll: (page?: number, limit?: number, search?: string) => {
    const params = new URLSearchParams();
    if (page) params.set("page", page.toString());
    if (limit) params.set("limit", limit.toString());
    if (search?.trim()) params.set("search", search.trim());
    const query = params.toString() ? `?${params.toString()}` : "";
    return request<PaginatedResponse<Course>>(`/courses${query}`);
  },
  getOne: (id: number) => request<CourseWithStudents>(`/courses/${id}`),
  create: (data: { name: string }) =>
    request<Course>("/courses", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: number, data: { name: string }) =>
    request<Course>(`/courses/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<Course>(`/courses/${id}`, { method: "DELETE" }),
  export: () => requestBlob("/courses/export"),
};

// ─── Guardians ────────────────────────────────────────────────
export const guardiansApi = {
  getAll: (page?: number, limit?: number, search?: string) => {
    const params = new URLSearchParams();
    if (page) params.set("page", page.toString());
    if (limit) params.set("limit", limit.toString());
    if (search?.trim()) params.set("search", search.trim());
    const query = params.toString() ? `?${params.toString()}` : "";
    return request<PaginatedResponse<Guardian>>(`/guardians${query}`);
  },
  getOne: (id: number) => request<Guardian>(`/guardians/${id}`),
  create: (data: GuardianPayload) =>
    request<Guardian>("/guardians", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: number, data: GuardianPayload) =>
    request<Guardian>(`/guardians/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<Guardian>(`/guardians/${id}`, { method: "DELETE" }),
  export: () => requestBlob("/guardians/export"),
};

// ─── Students ─────────────────────────────────────────────────
export type StudentsListParams = {
  courseId?: number;
  status?: StudentStatus;
  page?: number;
  limit?: number;
  search?: string;
};

export const studentsApi = {
  getAll: (params?: StudentsListParams) => {
    const qs = new URLSearchParams();
    if (params?.courseId) qs.set("courseId", params.courseId.toString());
    if (params?.status) qs.set("status", params.status);
    if (params?.page) qs.set("page", params.page.toString());
    if (params?.limit) qs.set("limit", params.limit.toString());
    if (params?.search?.trim()) qs.set("search", params.search.trim());
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return request<PaginatedResponse<Student>>(`/students${query}`);
  },
  getOne: (id: number) => request<Student>(`/students/${id}`),
  create: (data: {
    rut: string;
    name: string;
    courseId: number;
    guardianId: number;
    status?: StudentStatus;
  }) =>
    request<Student>("/students", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: number, data: Partial<Student>) =>
    request<Student>(`/students/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<Student>(`/students/${id}`, { method: "DELETE" }),
  export: (courseId?: number) => {
    const params = courseId ? `?courseId=${courseId}` : "";
    return requestBlob(`/students/export${params}`);
  },
};

// ─── Payments ─────────────────────────────────────────────────
export const paymentsApi = {
  getAll: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    return request<PaginatedResponse<Payment>>(`/payments${query}`);
  },
  getGroups: (params?: {
    page?: string;
    limit?: string;
    dateFrom?: string;
    dateTo?: string;
    studentId?: string;
    courseId?: string;
    method?: PaymentMethod;
  }) => {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    return request<PaginatedResponse<PaymentGroup>>(`/payments/groups${query}`);
  },
  getOne: (id: number) => request<Payment>(`/payments/${id}`),
  create: (formData: FormData) =>
    request<Payment>("/payments", {
      method: "POST",
      body: formData,
    }),
  createBatch: (formData: FormData) =>
    request<PaymentGroup>("/payments/batch", {
      method: "POST",
      body: formData,
    }),
  deleteGroup: (id: number) =>
    request<PaymentGroup>(`/payments/groups/${id}`, { method: "DELETE" }),
  resolveBoleta: (id: number, formData: FormData) =>
    request<PaymentGroup>(`/payments/groups/${id}/boleta`, {
      method: "PATCH",
      body: formData,
    }),
  resolvePendingBoleta: (
    id: number,
    data: { boletaNumber: string; boleta?: File },
  ) => {
    const fd = new FormData();
    fd.append("boletaNumber", data.boletaNumber);
    if (data.boleta) fd.append("boleta", data.boleta);
    return paymentsApi.resolveBoleta(id, fd);
  },
  summaryByCourse: (dateFrom?: string, dateTo?: string) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const query = params.toString() ? `?${params.toString()}` : "";
    return request<CourseSummary[]>(`/payments/summary/by-course${query}`);
  },
  export: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params).toString()}` : "";
    return requestBlob(`/payments/export${query}`);
  },
};

// ─── Notifications ───────────────────────────────────────────
export const notificationsApi = {
  getAll: (filters: NotificationLogFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.page != null) params.set("page", String(filters.page));
    if (filters.limit != null) params.set("limit", String(filters.limit));
    if (filters.search) params.set("search", filters.search);
    if (filters.status) params.set("status", filters.status);
    if (filters.type) params.set("type", filters.type);
    const query = params.size > 0 ? `?${params.toString()}` : "";
    return request<PaginatedResponse<NotificationLog>>(
      `/notifications${query}`,
    );
  },
};

// ─── Analytics ───────────────────────────────────────────────
export interface FinancialDashboard {
  totalActiveStudents: number;
  totalCourses: number;
  currentMonthRevenue: number;
  totalOverdueDebt: number;
  totalExpectedRevenue: number;
  revenueByMonth: RevenueTrendItem[];
}

export const analyticsApi = {
  getDashboard: () => request<FinancialDashboard>("/analytics/dashboard"),
};

// ─── Charges / Accounts Receivable ───────────────────────────
export const chargesApi = {
  setupFinancialPlan: (studentId: number, data: SetupFinancialPlanDto) =>
    request<{ message: string; count: number }>(`/charges/setup/${studentId}`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getPlan: (studentId: number) => request<Charge[]>(`/charges/plan/${studentId}`),
  updateFinancialPlan: (studentId: number, data: UpdateFinancialPlanDto) =>
    request<Charge[]>(`/charges/plan/${studentId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  getPendingCharges: (studentId: number) =>
    request<Charge[]>(`/charges/pending/${studentId}`),
  getAccountStatement: (studentId: number) =>
    request<StudentAccountStatement>(`/charges/statement/${studentId}`),
};

// ─── Payment Concepts ─────────────────────────────────────────
export const conceptsApi = {
  getAll: () => request<PaymentConcept[]>("/payment-concepts"),
  getOne: (id: number) => request<PaymentConcept>(`/payment-concepts/${id}`),
  create: (data: { name: string; defaultAmount: number; isActive?: boolean }) =>
    request<PaymentConcept>("/payment-concepts", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (
    id: number,
    data: Partial<{ name: string; defaultAmount: number; isActive: boolean }>,
  ) =>
    request<PaymentConcept>(`/payment-concepts/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<PaymentConcept>(`/payment-concepts/${id}`, { method: "DELETE" }),
};

// ─── Reports ──────────────────────────────────────────────────
export interface ReportSummary {
  totalCollected: number;
  totalTransactions: number;
  byMethod: {
    method: string;
    total: number;
    count: number;
  }[];
}

export interface RevenueTrendItem {
  month: string;
  total: number;
}

export const reportsApi = {
  getSummary: (startDate?: string, endDate?: string, courseId?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (courseId) params.set("courseId", courseId);
    const query = params.toString() ? `?${params.toString()}` : "";
    return request<ReportSummary>(`/reports/summary${query}`);
  },
  export: (params?: { dateFrom?: string; dateTo?: string }) => {
    const search = new URLSearchParams();
    if (params?.dateFrom) search.set("startDate", params.dateFrom);
    if (params?.dateTo) search.set("endDate", params.dateTo);
    const query = search.toString() ? `?${search.toString()}` : "";
    return requestBlob(`/reports/monthly${query}`);
  },
  getRevenueTrend: (months = 12) =>
    request<RevenueTrendItem[]>(
      `/reports/dashboard/revenue-trend?months=${months}`,
    ),
  monthly: () => requestBlob("/reports/monthly"),
};

// ─── Roles & Permissions ──────────────────────────────────────
export interface Permission {
  id: number;
  action: string;
  module: string;
}

export interface Role {
  id: number;
  name: string;
  permissions?: Permission[];
}

export const rolesApi = {
  getAll: () => request<Role[]>("/roles"),
  create: (data: { name: string; permissionIds: number[] }) =>
    request<Role>("/roles", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getPermissions: () => request<Permission[]>("/roles/permissions"),
};

// ─── Users ────────────────────────────────────────────────────
export interface User {
  id: number;
  name: string;
  email: string;
  roleId: number;
  role?: Role;
  isActive: boolean;
}

export const usersApi = {
  getAll: () => request<User[]>("/users"),
  create: (data: { name: string; email: string; roleId: number }) =>
    request<User>("/users", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  toggleActive: (id: number) =>
    request<User>(`/users/${id}/toggle`, { method: "PATCH" }),
};
