const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

/**
 * Wrapper de fetch que:
 * 1. Inyecta Content-Type JSON salvo para FormData.
 * 2. Parsea errores del GlobalExceptionFilter: { statusCode, message }.
 * 3. Desenvuelve el envelope del TransformInterceptor: { data } → T.
 */
async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      ...(options?.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
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
    // Si tiene meta (paginación), devolver el objeto completo
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
    
    // helper to get cookie token
    const tokenMatch = typeof document !== 'undefined' ? document.cookie.match(/(^| )auth_token=([^;]+)/) : null;
    const token = tokenMatch ? tokenMatch[2] : null;

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const query = params.toString() ? `?${params.toString()}` : "";
    return request<ReportSummary>(`/reports/summary${query}`, { headers });
  },
};
