import { SetMetadata } from '@nestjs/common';

export type UserRole = 'postulante' | 'evaluador' | 'administrador';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
