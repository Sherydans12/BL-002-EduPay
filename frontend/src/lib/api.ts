const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

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
  rut: string;
  name: string;
  email?: string;
  phone?: string;
  _count?: { students: number };
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

export interface Payment {
  id: number;
  amount: number;
  method: string;
  paymentDate: string;
  studentId: number;
  student: Student;
  payerName?: string;
  payerRut?: string;
  referenceCode?: string;
  notes?: string;
  boletaFileUrl?: string;
  boletaNumber?: string;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
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
  getAll: () => request<Course[]>("/courses"),
  getOne: (id: number) => request<Course>(`/courses/${id}`),
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
};

// ─── Guardians ────────────────────────────────────────────────
export const guardiansApi = {
  getAll: () => request<Guardian[]>("/guardians"),
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
};

// ─── Students ─────────────────────────────────────────────────
export const studentsApi = {
  getAll: (courseId?: number) =>
    request<Student[]>(
      `/students${courseId ? `?courseId=${courseId}` : ""}`
    ),
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
};

// ─── Payments ─────────────────────────────────────────────────
export const paymentsApi = {
  getAll: (params?: Record<string, string>) => {
    const query = params
      ? `?${new URLSearchParams(params).toString()}`
      : "";
    return request<PaginatedResponse<Payment>>(`/payments${query}`);
  },
  getOne: (id: number) => request<Payment>(`/payments/${id}`),
  create: (formData: FormData) =>
    request<Payment>("/payments", {
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

export const reportsApi = {
  getSummary: (startDate?: string, endDate?: string, courseId?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (courseId) params.set("courseId", courseId);
    const query = params.toString() ? `?${params.toString()}` : "";
    return request<ReportSummary>(`/reports/summary${query}`);
  },
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
  getPermissions: () => request<Permission[]>("/permissions"),
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
