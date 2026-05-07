'use client';

import { useState, useEffect } from 'react';
import { reportsApi, coursesApi, Course, ReportSummary } from '@/lib/api';
import { NativeSelectField } from '@/components/ui/dropdown-chevron';

export default function ReportesPage() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [courseId, setCourseId] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    coursesApi.getAll()
      .then((res) => setCourses(res.data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [startDate, endDate, courseId]);

  const fetchSummary = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await reportsApi.getSummary(startDate, endDate, courseId);
      setSummary(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar el reporte');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6 text-white">Panel de Control Financiero</h1>

      {/* Control Panel / Filtros */}
      <div className="bg-white/10 backdrop-blur-md p-6 rounded-xl border border-white/20 shadow-xl mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Fecha Inicio</label>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Fecha Fin</label>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Filtrar por Curso</label>
            <NativeSelectField chevronClassName="text-gray-400 opacity-90">
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos los cursos</option>
                {courses.map(course => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </NativeSelectField>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-100 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Tarjetas de Resumen */}
      {loading && !summary ? (
        <div className="text-white text-center py-10">Cargando reporte...</div>
      ) : summary ? (
        <div className="space-y-8">
          {/* Main KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-blue-600/40 to-purple-600/40 backdrop-blur-md p-6 rounded-xl border border-white/20">
              <h3 className="text-blue-200 text-sm font-medium uppercase tracking-wider mb-2">Ingresos Totales</h3>
              <p className="text-4xl font-bold text-white">{formatCurrency(summary.totalCollected)}</p>
            </div>
            <div className="bg-gradient-to-br from-green-600/40 to-teal-600/40 backdrop-blur-md p-6 rounded-xl border border-white/20">
              <h3 className="text-green-200 text-sm font-medium uppercase tracking-wider mb-2">Transacciones Registradas</h3>
              <p className="text-4xl font-bold text-white">{summary.totalTransactions}</p>
            </div>
          </div>

          {/* Breakdown by Method */}
          <div>
            <h2 className="text-xl font-semibold text-white mb-4">Desglose por M\u00e9todo de Pago</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {summary.byMethod.map((item, idx) => (
                <div key={idx} className="bg-white/5 backdrop-blur-md p-5 rounded-xl border border-white/10 flex flex-col justify-between">
                  <div>
                    <h4 className="text-gray-400 text-xs font-semibold uppercase mb-1">{item.method}</h4>
                    <p className="text-2xl font-bold text-gray-100">{formatCurrency(item.total)}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/10">
                    <span className="text-sm text-gray-400">{item.count} pagos</span>
                  </div>
                </div>
              ))}
              {summary.byMethod.length === 0 && (
                <div className="col-span-full text-gray-400 text-center py-4 bg-black/20 rounded-xl">
                  No hay datos para el periodo o curso seleccionado.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
