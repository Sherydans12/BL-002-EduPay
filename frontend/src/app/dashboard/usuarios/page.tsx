'use client';

import { useState } from 'react';

type User = { id: string; name: string; email: string; role: string; isActive: boolean };

export default function UsuariosPage() {
  // Simulando datos
  const [users, setUsers] = useState<User[]>([
    { id: '1', name: 'Admin Principal', email: 'admin@edupay.cl', role: 'ADMIN', isActive: true },
    { id: '2', name: 'Juan P\u00e9rez', email: 'juan@edupay.cl', role: 'CONTADOR', isActive: true },
  ]);

  const toggleStatus = (id: string) => {
    setUsers(users.map(u => u.id === id ? { ...u, isActive: !u.isActive } : u));
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">Gesti\u00f3n de Usuarios</h1>
        <button className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg transition-colors font-medium">
          + Invitar Usuario
        </button>
      </div>

      <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 overflow-hidden shadow-xl">
        <table className="w-full text-left text-gray-300">
          <thead className="bg-black/40 text-sm uppercase">
            <tr>
              <th className="px-6 py-4 font-medium text-white">Nombre</th>
              <th className="px-6 py-4 font-medium text-white">Email</th>
              <th className="px-6 py-4 font-medium text-white">Rol</th>
              <th className="px-6 py-4 font-medium text-white">Estado</th>
              <th className="px-6 py-4 font-medium text-white text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4">{user.name}</td>
                <td className="px-6 py-4">{user.email}</td>
                <td className="px-6 py-4">
                  <span className="bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded-full text-xs font-semibold">
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${user.isActive ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                    {user.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button 
                    onClick={() => toggleStatus(user.id)}
                    className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${user.isActive ? 'border-red-500 text-red-400 hover:bg-red-500/10' : 'border-green-500 text-green-400 hover:bg-green-500/10'}`}
                  >
                    {user.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
