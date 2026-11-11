import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, MaxLength } from 'class-validator';

export class DiagnosticoNotificacionesAppQueryDto {
  @ApiPropertyOptional({
    description:
      'Correo de una cuenta para saber si hoy recibiría los avisos de la campanita.',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

export class CuentaDiagnosticoDto {
  @ApiProperty() usuarioId: string;
  @ApiProperty({ description: 'Valor de `rol` tal como está guardado' })
  rol: string;
  @ApiProperty() eliminada: boolean;
  @ApiProperty({ description: '¿Entra en la consulta de destinatarios?' })
  incluida: boolean;
}

export class DiagnosticoNotificacionesAppDto {
  @ApiProperty({ example: true }) soloLectura: true;

  @ApiProperty({ description: 'Expresión aplicada a `rol`' })
  filtroRol: string;

  @ApiProperty({
    example: { total: 3, porRol: { evaluador: 2, administrador: 1 } },
  })
  destinatarios: { total: number; porRol: Record<string, number> };

  @ApiPropertyOptional()
  consulta?: {
    email: string;
    incluida: boolean;
    cuentas: CuentaDiagnosticoDto[];
  };

  @ApiProperty()
  coleccion: {
    nombre: string;
    existe: boolean;
    indices: string[];
    avisosPorTipo: Record<string, number>;
    ultimaCreadaEn: Date | null;
  };

  @ApiProperty({
    description:
      'Postulantes sin eliminar que no tienen perfil en `postulantes` (sin él no se puede crear su aviso de nuevo candidato)',
  })
  postulantesSinPerfil: number;
}
