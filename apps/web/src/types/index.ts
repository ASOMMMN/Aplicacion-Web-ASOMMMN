export type UserRole = 'postulante' | 'evaluador' | 'administrador';

export type AccountStatus =
  | 'pendiente_verificacion'
  | 'activa'
  | 'bloqueada';

export type EvaluationStatus =
  | 'pendiente'
  | 'en_revision'
  | 'informacion_solicitada'
  | 'evaluado';

export type EvaluationResult = 'aprobado' | 'rechazado';

export interface User {
  _id: string;
  email: string;
  nombre: string;
  apellidos: string;
  rol: UserRole;
  estadoCuenta: AccountStatus;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}
