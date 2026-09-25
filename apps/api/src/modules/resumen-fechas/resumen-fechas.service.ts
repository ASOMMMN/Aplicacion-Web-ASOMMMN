import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  Extraccion,
  ExtraccionDocument,
} from '../ingest-ia/schemas/extraccion.schema';

import {
  Postulante,
  PostulanteDocument,
} from '../postulantes/schemas/postulante.schema';

import {
  Usuario,
  UsuarioDocument,
} from '../usuarios/schemas/usuario.schema';

import { CursosService } from '../cursos/cursos.service';

import { DocsPersonalesService } from '../docs-personales/docs-personales.service';

export interface ResumenFechaItem {
  tipo: 'Curso' | 'Documento personal';

  nombre: string;

  fechaInicio: string | null;

  fechaVencimiento: string | null;

  fuente: string[];
}

export interface ResumenFechasResponse {
  titulo: string;

  postulante: string;

  fechaGeneracion: string;

  items: ResumenFechaItem[];
}

@Injectable()
export class ResumenFechasService {
  private readonly logger = new Logger(
    ResumenFechasService.name,
  );

  constructor(
    @InjectModel(Extraccion.name)
    private readonly extraccionModel: Model<ExtraccionDocument>,

    @InjectModel(Postulante.name)
    private readonly postulanteModel: Model<PostulanteDocument>,

    @InjectModel(Usuario.name)
    private readonly usuarioModel: Model<UsuarioDocument>,

    private readonly cursosService: CursosService,

    private readonly docsPersonalesService: DocsPersonalesService,
  ) {}

  // ============================================================
  // NORMALIZACIÓN DE NOMBRES
  // ============================================================

  /**
   * Normaliza nombres para poder detectar duplicados.
   *
   * Ejemplo:
   *
   * "Updating for Engineer Officer.pdf"
   *
   * "Updating for Engineer Officer"
   *
   * terminan teniendo la misma clave.
   */
  private normalizarNombre(
    valor: unknown,
  ): string {
    if (
      typeof valor !== 'string' ||
      !valor.trim()
    ) {
      return '';
    }

    return valor
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        '',
      )
      .toLowerCase()
      .replace(
        /\.(pdf|jpg|jpeg|png|doc|docx)$/i,
        '',
      )
      .replace(
        /[^a-z0-9]+/g,
        ' ',
      )
      .replace(
        /\s+/g,
        ' ',
      )
      .trim();
  }

  // ============================================================
  // NORMALIZACIÓN DE FECHAS
  // ============================================================

  /**
   * Convierte una fecha válida a YYYY-MM-DD.
   *
   * IMPORTANTE:
   *
   * Esta función NO calcula fechas.
   *
   * Si no existe una fecha:
   * devuelve null.
   */
  private normalizarFecha(
    valor: unknown,
  ): string | null {
    if (!valor) {
      return null;
    }

    if (
      typeof valor === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(
        valor,
      )
    ) {
      return valor;
    }

    const fecha = new Date(
      valor as string | Date,
    );

    if (
      Number.isNaN(
        fecha.getTime(),
      )
    ) {
      return null;
    }

    return fecha
      .toISOString()
      .slice(0, 10);
  }

  // ============================================================
  // OBTENER NOMBRE DEL POSTULANTE
  // ============================================================

  private async obtenerNombrePostulante(
    postulanteId: string,
  ): Promise<string> {
    const postulante =
      await this.postulanteModel
        .findById(postulanteId)
        .lean();

    if (!postulante) {
      throw new NotFoundException(
        'Postulante no encontrado.',
      );
    }

    const postulanteData =
      postulante as any;

    let usuario: any = null;

    if (
      postulanteData.usuarioId
    ) {
      usuario =
        await this.usuarioModel
          .findById(
            postulanteData.usuarioId,
          )
          .lean();
    }

    if (usuario) {
      const nombreUsuario = [
        usuario.nombre,
        usuario.apellidos,
      ]
        .filter(
          (valor) =>
            typeof valor ===
              'string' &&
            valor.trim(),
        )
        .join(' ')
        .trim();

      if (nombreUsuario) {
        return nombreUsuario;
      }
    }

    const nombrePostulante = [
      postulanteData.nombre,
      postulanteData.apellidos,
      postulanteData.nombres,
    ]
      .filter(
        (valor) =>
          typeof valor ===
            'string' &&
          valor.trim(),
      )
      .join(' ')
      .trim();

    return (
      nombrePostulante ||
      'Postulante'
    );
  }

  // ============================================================
  // CONVERTIR RESPUESTA DE CURSOS EN ARREGLO
  // ============================================================

  /**
   * CursosService.listarCursosPorPostulante()
   * devuelve un CursosListResponseDto.
   *
   * Dependiendo de la estructura actual,
   * intentamos localizar el arreglo de cursos
   * sin forzar directamente el DTO a any[].
   */
  private obtenerListaCursos(
    respuesta: unknown,
  ): any[] {
    if (Array.isArray(respuesta)) {
      return respuesta;
    }

    const data =
      respuesta as any;

    if (
      Array.isArray(
        data?.cursos,
      )
    ) {
      return data.cursos;
    }

    if (
      Array.isArray(
        data?.items,
      )
    ) {
      return data.items;
    }

    if (
      Array.isArray(
        data?.data,
      )
    ) {
      return data.data;
    }

    if (
      Array.isArray(
        data?.resultados,
      )
    ) {
      return data.resultados;
    }

    return [];
  }

  // ============================================================
  // CURSOS REGISTRADOS
  // ============================================================

  private async obtenerCursosRegistrados(
    postulanteId: string,
  ): Promise<ResumenFechaItem[]> {
    const respuesta =
      await this.cursosService.listarCursosPorPostulante(
        postulanteId,
      );

    const cursos =
      this.obtenerListaCursos(
        respuesta,
      );

    const resultado: ResumenFechaItem[] =
      [];

    for (
      const curso of cursos
    ) {
      const nombre =
        typeof curso?.nombreCurso ===
          'string'
          ? curso.nombreCurso.trim()
          : typeof curso?.nombre ===
              'string'
            ? curso.nombre.trim()
            : '';

      if (!nombre) {
        continue;
      }

      /**
       * NO calculamos vencimientos.
       *
       * Para inicio:
       *
       * 1. fechaInicio
       * 2. fechaCurso
       * 3. null
       *
       * Para vencimiento:
       *
       * 1. fechaVencimiento
       * 2. null
       */
      const fechaInicio =
        this.normalizarFecha(
          curso?.fechaInicio ??
            curso?.fechaCurso ??
            null,
        );

      const fechaVencimiento =
        this.normalizarFecha(
          curso?.fechaVencimiento ??
            null,
        );

      resultado.push({
        tipo: 'Curso',

        nombre,

        fechaInicio,

        fechaVencimiento,

        fuente: [
          'Cursos registrados',
        ],
      });
    }

    return resultado;
  }

  // ============================================================
  // CURSOS ENCONTRADOS EN CV
  // ============================================================

  private async obtenerCursosCV(
    postulanteId: string,
  ): Promise<ResumenFechaItem[]> {
    const extraccion =
      await this.extraccionModel
        .findOne({
          postulanteId,
        })
        .sort({
          creadoEn: -1,
        })
        .lean();

    if (!extraccion) {
      return [];
    }

    const extraccionData =
      extraccion as any;

    /**
     * Si existen datos confirmados,
     * tienen prioridad sobre los datos
     * extraídos por IA.
     */
    const datos =
      extraccionData.datosConfirmados ??
      extraccionData.datosExtraidos;

    if (
      !datos ||
      !Array.isArray(
        datos.cursos,
      )
    ) {
      return [];
    }

    const resultado: ResumenFechaItem[] =
      [];

    for (
      const curso of datos.cursos
    ) {
      const nombre =
        typeof curso?.nombre ===
          'string'
          ? curso.nombre.trim()
          : '';

      if (!nombre) {
        continue;
      }

      resultado.push({
        tipo: 'Curso',

        nombre,

        fechaInicio:
          this.normalizarFecha(
            curso?.fechaInicio ??
              null,
          ),

        fechaVencimiento:
          this.normalizarFecha(
            curso?.fechaVencimiento ??
              null,
          ),

        fuente: [
          'CV',
        ],
      });
    }

    return resultado;
  }

  // ============================================================
  // DOCUMENTOS PERSONALES
  // ============================================================

  /**
   * Extrae documentos aunque el servicio
   * los devuelva agrupados de distintas maneras.
   */
  private extraerDocumentosRecursivo(
    valor: unknown,
    resultado: any[],
    nombreGrupo?: string,
  ): void {
    if (!valor) {
      return;
    }

    if (Array.isArray(valor)) {
      for (
        const elemento of valor
      ) {
        this.extraerDocumentosRecursivo(
          elemento,
          resultado,
          nombreGrupo,
        );
      }

      return;
    }

    if (
      typeof valor !== 'object'
    ) {
      return;
    }

    const objeto =
      valor as any;

    const nombrePropio =
      objeto?.nombreOriginal ??
      objeto?.nombre ??
      objeto?.tipoDocumento ??
      objeto?.tipo ??
      objeto?.label ??
      objeto?.titulo ??
      null;

    const nombreActual =
      typeof nombrePropio ===
        'string' &&
      nombrePropio.trim()
        ? nombrePropio.trim()
        : nombreGrupo;

    /**
     * Detectamos si el objeto
     * parece ser realmente un documento.
     */
    const tieneDatosDocumento =
      Boolean(
        objeto?.fechaInicio ||
        objeto?.fechaEmision ||
        objeto?.fechaVencimiento ||
        objeto?.nombreOriginal ||
        objeto?.ruta ||
        objeto?.url ||
        objeto?.archivo ||
        objeto?.filename ||
        objeto?.fileName,
      );

    if (
      tieneDatosDocumento &&
      nombreActual
    ) {
      resultado.push({
        nombre: String(
          nombreActual,
        ).trim(),

        fechaInicio:
          this.normalizarFecha(
            objeto?.fechaInicio ??
              objeto?.fechaEmision ??
              null,
          ),

        fechaVencimiento:
          this.normalizarFecha(
            objeto?.fechaVencimiento ??
              null,
          ),
      });
    }

    /**
     * Revisamos propiedades anidadas.
     */
    for (
      const [clave, contenido] of Object.entries(
        objeto,
      )
    ) {
      /**
       * Evitamos recorrer metadatos
       * que no contienen documentos.
       */
      if (
        clave === '_id' ||
        clave === 'id' ||
        clave === '__v' ||
        clave === 'creadoEn' ||
        clave === 'actualizadoEn'
      ) {
        continue;
      }

      if (
        typeof contenido ===
          'object' &&
        contenido !== null
      ) {
        this.extraerDocumentosRecursivo(
          contenido,
          resultado,
          nombreActual,
        );
      }
    }
  }

  private async obtenerDocumentosPersonales(
    postulanteId: string,
  ): Promise<ResumenFechaItem[]> {
    const respuesta =
      await this.docsPersonalesService.listarPorPostulante(
        postulanteId,
      );

    const encontrados: any[] =
      [];

    this.extraerDocumentosRecursivo(
      respuesta,
      encontrados,
    );

    const resultado: ResumenFechaItem[] =
      [];

    for (
      const documento of encontrados
    ) {
      if (
        !documento?.nombre
      ) {
        continue;
      }

      resultado.push({
        tipo: 'Documento personal',

        nombre:
          documento.nombre,

        fechaInicio:
          documento.fechaInicio ??
          null,

        fechaVencimiento:
          documento.fechaVencimiento ??
          null,

        fuente: [
          'Documentos personales',
        ],
      });
    }

    return resultado;
  }

  // ============================================================
  // UNIFICAR CURSOS
  // ============================================================

  private unificarCursos(
    cursosRegistrados: ResumenFechaItem[],
    cursosCV: ResumenFechaItem[],
  ): ResumenFechaItem[] {
    const mapa =
      new Map<
        string,
        ResumenFechaItem
      >();

    /**
     * Primero agregamos cursos
     * registrados en la plataforma.
     */
    for (
      const curso of cursosRegistrados
    ) {
      const clave =
        this.normalizarNombre(
          curso.nombre,
        );

      if (!clave) {
        continue;
      }

      mapa.set(
        clave,
        {
          ...curso,

          fuente: [
            ...curso.fuente,
          ],
        },
      );
    }

    /**
     * Después agregamos los cursos
     * encontrados en el CV.
     */
    for (
      const curso of cursosCV
    ) {
      const clave =
        this.normalizarNombre(
          curso.nombre,
        );

      if (!clave) {
        continue;
      }

      const existente =
        mapa.get(clave);

      /**
       * Si no existe en Cursos,
       * se agrega desde CV.
       */
      if (!existente) {
        mapa.set(
          clave,
          {
            ...curso,
          },
        );

        continue;
      }

      /**
       * Ya existe tanto en CV
       * como en Cursos.
       *
       * Lo consideramos el mismo curso.
       *
       * Las fechas registradas
       * tienen prioridad.
       *
       * El CV solamente completa
       * campos que estén vacíos.
       */
      existente.fechaInicio =
        existente.fechaInicio ??
        curso.fechaInicio ??
        null;

      existente.fechaVencimiento =
        existente.fechaVencimiento ??
        curso.fechaVencimiento ??
        null;

      existente.fuente = [
        ...new Set([
          ...existente.fuente,
          ...curso.fuente,
        ]),
      ];
    }

    return Array.from(
      mapa.values(),
    );
  }

  // ============================================================
  // UNIFICAR DOCUMENTOS PERSONALES
  // ============================================================

  private unificarDocumentosPersonales(
    documentos: ResumenFechaItem[],
  ): ResumenFechaItem[] {
    const mapa =
      new Map<
        string,
        ResumenFechaItem
      >();

    for (
      const documento of documentos
    ) {
      const clave =
        this.normalizarNombre(
          documento.nombre,
        );

      if (!clave) {
        continue;
      }

      const existente =
        mapa.get(clave);

      /**
       * Si no existe,
       * lo agregamos.
       */
      if (!existente) {
        mapa.set(
          clave,
          {
            ...documento,
          },
        );

        continue;
      }

      /**
       * Si existen varias copias
       * del mismo documento,
       * conservamos cualquier fecha
       * que falte.
       *
       * Nunca calculamos fechas.
       */
      existente.fechaInicio =
        existente.fechaInicio ??
        documento.fechaInicio ??
        null;

      existente.fechaVencimiento =
        existente.fechaVencimiento ??
        documento.fechaVencimiento ??
        null;

      existente.fuente = [
        ...new Set([
          ...existente.fuente,
          ...documento.fuente,
        ]),
      ];
    }

    return Array.from(
      mapa.values(),
    );
  }

  // ============================================================
  // GENERAR RESUMEN
  // ============================================================

  async generarResumen(
    postulanteId: string,
  ): Promise<ResumenFechasResponse> {
    this.logger.log(
      `Generando resumen de fechas para postulante ${postulanteId}`,
    );

    const postulante =
      await this.obtenerNombrePostulante(
        postulanteId,
      );

    const [
      cursosRegistrados,
      cursosCV,
      documentosPersonales,
    ] = await Promise.all([
      this.obtenerCursosRegistrados(
        postulanteId,
      ),

      this.obtenerCursosCV(
        postulanteId,
      ),

      this.obtenerDocumentosPersonales(
        postulanteId,
      ),
    ]);

    /**
     * CV + Cursos.
     */
    const cursos =
      this.unificarCursos(
        cursosRegistrados,
        cursosCV,
      );

    /**
     * Documentos personales.
     */
    const documentos =
      this.unificarDocumentosPersonales(
        documentosPersonales,
      );

    /**
     * Resultado final.
     */
    const items = [
      ...cursos,
      ...documentos,
    ];

    /**
     * Orden:
     *
     * 1. Cursos
     * 2. Documentos personales
     *
     * Dentro de cada grupo:
     * orden alfabético.
     */
    items.sort(
      (a, b) => {
        if (
          a.tipo !== b.tipo
        ) {
          return a.tipo ===
            'Curso'
            ? -1
            : 1;
        }

        return a.nombre.localeCompare(
          b.nombre,
          'es',
          {
            sensitivity: 'base',
          },
        );
      },
    );

    return {
      titulo:
        'RESUMEN DE FECHAS — EXTRACCIÓN IA',

      postulante,

      fechaGeneracion:
        new Date()
          .toISOString()
          .slice(0, 10),

      items,
    };
  }

  // ============================================================
  // RESUMEN FORMATEADO
  // ============================================================

  async generarResumenFormateado(
    postulanteId: string,
  ) {
    const resumen =
      await this.generarResumen(
        postulanteId,
      );

    return {
      titulo:
        resumen.titulo,

      postulante:
        resumen.postulante,

      fechaGeneracion:
        this.formatearFechaReporte(
          resumen.fechaGeneracion,
        ),

      filas:
        resumen.items.map(
          (item) => ({
            tipo:
              item.tipo,

            nombre:
              item.nombre,

            fechaInicio:
              this.formatearFechaReporte(
                item.fechaInicio,
              ),

            fechaVencimiento:
              this.formatearFechaReporte(
                item.fechaVencimiento,
              ),

            fuente:
              item.fuente,
          }),
        ),
    };
  }

  // ============================================================
  // FORMATEAR FECHA PARA REPORTE
  // ============================================================

  private formatearFechaReporte(
    valor: string | null,
  ): string {
    if (!valor) {
      return '—';
    }

    const partes =
      valor.split('-');

    if (
      partes.length !== 3
    ) {
      return '—';
    }

    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }
}