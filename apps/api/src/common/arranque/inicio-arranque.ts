/**
 * Efecto de arranque: main.ts lo importa ANTES que todo lo demás, así que
 * esta es la primera línea del proceso en el log de Render, aunque cargar
 * Nest y los módulos tarde minutos con la CPU de Render Free.
 */
import { fase, iniciarVigilante } from './fases-arranque';

fase(
  'modulos',
  `cargando código de la API (node ${process.version}, pid ${process.pid})`,
);
iniciarVigilante();
