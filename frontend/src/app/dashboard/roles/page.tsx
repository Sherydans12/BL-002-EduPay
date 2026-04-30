import RolesClientView from './RolesClientView';

async function getRolesAndPermissions() {
  const roles = []; 
  const permissions = [
    { id: '1', action: 'view:users', module: 'Usuarios' },
    { id: '2', action: 'create:payment', module: 'Pagos' },
    { id: '3', action: 'manage:roles', module: 'Configuraci\u00f3n' },
  ];
  return { roles, permissions };
}

export default async function RolesPage() {
  const { roles, permissions } = await getRolesAndPermissions();

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6 text-white">Gesti\u00f3n de Roles y Permisos</h1>
      <RolesClientView initialRoles={roles} availablePermissions={permissions} />
    </div>
  );
}
