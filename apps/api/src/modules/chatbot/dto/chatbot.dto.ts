import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class EnviarMensajeDto {
  @ApiProperty({
    description: 'Texto del mensaje del postulante',
    example: '¿Cómo subo mi CURP?',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  mensaje: string;
}

export class MensajeResponseDto {
  @ApiProperty()
  rol: string;

  @ApiProperty()
  contenido: string;

  @ApiProperty({ required: false })
  resuelto?: boolean;

  @ApiProperty()
  creadoEn: Date;
}

export class EnviarMensajeResponseDto {
  @ApiProperty()
  respuesta: string;

  @ApiProperty()
  mostrarWhatsapp: boolean;

  @ApiProperty({ required: false })
  numeroWhatsapp?: string;
}

export class NuevaConversacionResponseDto {
  @ApiProperty()
  conversacionId: string;
}

export class HistorialResponseDto {
  @ApiProperty()
  conversacionId: string;

  @ApiProperty({ type: [MensajeResponseDto] })
  mensajes: MensajeResponseDto[];

  @ApiProperty()
  intentosSinResolver: number;

  @ApiProperty()
  whatsappOfrecido: boolean;

  @ApiProperty({ required: false })
  numeroWhatsapp?: string;
}

export class ConversacionItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  preview: string;

  @ApiProperty()
  totalMensajes: number;

  @ApiProperty()
  creadoEn: Date;

  @ApiProperty({ required: false })
  ultimoMensajeEn?: Date;

  @ApiProperty()
  activa: boolean;
}

export class ListarConversacionesResponseDto {
  @ApiProperty({ type: [ConversacionItemDto] })
  conversaciones: ConversacionItemDto[];
}

export class EliminarConversacionResponseDto {
  @ApiProperty()
  eraActiva: boolean;

  @ApiProperty({ required: false, type: HistorialResponseDto })
  nuevoHistorial?: HistorialResponseDto;
}
