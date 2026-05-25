const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

/** URL absoluta de un PDF guardado en el backend (boletaFileUrl = `/uploads/…`). */
export function resolveUploadUrl(boletaFileUrl: string): string {
  const base = API_URL.replace(/\/$/, "");
  const path = boletaFileUrl.startsWith("/") ? boletaFileUrl : `/${boletaFileUrl}`;
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
          : Object.entries(options.headers as Record<string, string>)
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
async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
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
          : Object.entries(options.headers as Record<string, string>)
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
  email?: string;
  phone?: string;
  _count?: { students: number };
}

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

export interface Student {
  id: number;
  rut: string;
  name: string;
  courseId: number;
  guardianId: number;
  course: Course;
  guardian: Guardian;
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
}

export interface PaymentGroup {
  id: number;
  totalAmount: number;
  method: string;
  paymentDate: string;
  boletaFileUrl?: string | null;
  boletaNumber?: string | null;
  notes?: string | null;
  payments: Payment[];
  createdAt: string;
  updatedAt: string;
}

/** Serializa el payload de pago agrupado para POST /payments/batch (multipart). */
export function buildPaymentBatchFormData(data: {
  totalAmount: number;
  method: string;
  paymentDate: string;
  allocations: Array<{ studentId: number; conceptId: number; amount: number }>;
  boletaNumber?: string;
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
      }))
    )
  );
  if (data.boletaNumber?.trim()) fd.append("boletaNumber", data.boletaNumber.trim());
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
  create: (data: Partial<Guardian>) =>
    request<Guardian>("/guardians", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  update: (id: number, data: Partial<Guardian>) =>
    request<Guardian>(`/guardians/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<Guardian>(`/guardians/${id}`, { method: "DELETE" }),
  export: () => requestBlob("/guardians/export"),
};

// ─── Students ─────────────────────────────────────────────────
export const studentsApi = {
  getAll: (courseId?: number, page?: number, limit?: number, search?: string) => {
    const params = new URLSearchParams();
    if (courseId) params.set("courseId", courseId.toString());
    if (page) params.set("page", page.toString());
    if (limit) params.set("limit", limit.toString());
    if (search?.trim()) params.set("search", search.trim());
    const query = params.toString() ? `?${params.toString()}` : "";
    return request<PaginatedResponse<Student>>(`/students${query}`);
  },
  getOne: (id: number) => request<Student>(`/students/${id}`),
  create: (data: {
    rut: string;
    name: string;
    courseId: number;
    guardianId: number;
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
    const query = params
      ? `?${new URLSearchParams(params).toString()}`
      : "";
    return request<PaginatedResponse<Payment>>(`/payments${query}`);
  },
  getGroups: (params?: Record<string, string>) => {
    const query = params
      ? `?${new URLSearchParams(params).toString()}`
      : "";
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
  delete: (id: number) =>
    request<Payment>(`/payments/${id}`, { method: "DELETE" }),
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

// ─── Payment Concepts ─────────────────────────────────────────
export const conceptsApi = {
  getAll: () => request<PaymentConcept[]>('/payment-concepts'),
  getOne: (id: number) => request<PaymentConcept>(`/payment-concepts/${id}`),
  create: (data: { name: string; defaultAmount: number; isActive?: boolean }) =>
    request<PaymentConcept>('/payment-concepts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (id: number, data: Partial<{ name: string; defaultAmount: number; isActive: boolean }>) =>
    request<PaymentConcept>(`/payment-concepts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  delete: (id: number) =>
    request<PaymentConcept>(`/payment-concepts/${id}`, { method: 'DELETE' }),
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
  export: (startDate?: string, endDate?: string, courseId?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (courseId) params.set("courseId", courseId);
    const query = params.toString() ? `?${params.toString()}` : "";
    return requestBlob(`/reports/export${query}`);
  },
  getRevenueTrend: (months = 12) =>
    request<RevenueTrendItem[]>(`/reports/dashboard/revenue-trend?months=${months}`),
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
