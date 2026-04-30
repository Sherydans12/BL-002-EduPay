'use client';

import { useState } from 'react';

type Permission = { id: string; action: string; module: string };
type Role = { id: string; name: string; permissions: Permission[] };

export default function RolesClientView({ 
  initialRoles, 
  availablePermissions 
}: { 
  initialRoles: Role[]; 
  availablePermissions: Permission[] 
}) {
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);

  const handleCheckboxChange = (permissionId: string) => {
    setSelectedPermissions(prev => 
      prev.includes(permissionId) 
        ? prev.filter(id => id !== permissionId)
        : [...prev, permissionId]
    );
  };

  const handleSaveRole = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;

    console.log("Payload para la API:", { name, permissions: selectedPermissions });
  };

  const groupedPermissions = availablePermissions.reduce((acc, perm) => {
    (acc[perm.module] = acc[perm.module] || []).push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <div className="bg-white/10 backdrop-blur-md p-6 rounded-xl border border-white/20 shadow-xl">
      <h2 className="text-xl font-semibold mb-4 text-white">Crear Nuevo Rol</h2>
      
      <form onSubmit={handleSaveRole} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-200 mb-2">Nombre del Rol</label>
          <input 
            type="text" 
            name="name" 
            className="w-full bg-black/30 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ej: SECRETARIA"
            required 
          />
        </div>

        <div>
          <h3 className="text-lg font-medium text-gray-200 mb-3">Permisos Disponibles</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(groupedPermissions).map(([module, perms]) => (
              <div key={module} className="bg-black/20 p-4 rounded-xl border border-white/5">
                <h4 className="font-semibold text-blue-400 mb-3 uppercase text-sm tracking-wider">{module}</h4>
                <div className="space-y-3">
                  {perms.map(perm => (
                    <label key={perm.id} className="flex items-center space-x-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        className="form-checkbox h-5 w-5 text-blue-500 rounded border-white/20 bg-black/40 focus:ring-blue-500/50"
                        checked={selectedPermissions.includes(perm.id)}
                        onChange={() => handleCheckboxChange(perm.id)}
                      />
                      <span className="text-gray-300 text-sm group-hover:text-white transition-colors">{perm.action}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button 
            type="submit" 
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-lg font-medium transition-all shadow-lg hover:shadow-blue-500/30"
          >
            Guardar Configuraci\u00f3n
          </button>
        </div>
      </form>
    </div>
  );
}
