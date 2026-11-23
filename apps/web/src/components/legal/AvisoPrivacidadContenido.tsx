/**
 * ============================================================================
 *  BORRADOR — PENDIENTE DE REVISIÓN LEGAL. No es un texto definitivo.
 * ============================================================================
 *
 * Aviso de privacidad integral de la Plataforma de Evaluación Curricular
 * (P-01 en AUDITORIA.md, LFPDPPP).
 *
 * - Parte I reproduce el aviso oficial publicado por ASOMMMN en
 *   https://asommmn.org.mx/privacidad (consultado el 23-nov-2026), con su
 *   redacción original. No se agregaron datos del responsable.
 * - Parte II es nueva y describe lo que hace esta plataforma con los datos
 *   de los postulantes, según el código actual.
 * - Todo dato que no está en el aviso oficial ni se desprende del código va
 *   como <Pendiente /> ("[POR COMPLETAR POR ASOMMMN]"); la lista está en el
 *   PR. Antes de publicar en firme, ASOMMMN y su asesor legal deben revisar
 *   el texto completo y, si cambia, subir AVISO_PRIVACIDAD_VERSION (web y
 *   API) para que los postulantes acepten la versión nueva.
 */
import type { ReactNode } from 'react';
import {
  AVISO_PRIVACIDAD_ACTUALIZADO,
  AVISO_PRIVACIDAD_VERSION,
  URL_AVISO_GENERAL_ASOMMMN,
} from '@/lib/privacidad/avisoPrivacidad';

const CORREO = 'asommmn@asommmn.org.mx';
const TELEFONOS = '(229) 932 2807 / (229) 932 8737';

/** Dato que ASOMMMN debe completar antes de publicar el aviso en firme. */
function Pendiente({ children }: { children?: ReactNode }) {
  return (
    <mark className="aviso-pendiente">
      [POR COMPLETAR POR ASOMMMN{children ? <>: {children}</> : null}]
    </mark>
  );
}

function Seccion({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} className="aviso-seccion" aria-labelledby={`${id}-titulo`}>
      <h3 id={`${id}-titulo`}>{titulo}</h3>
      {children}
    </section>
  );
}

const Correo = () => <a href={`mailto:${CORREO}`}>{CORREO}</a>;

export default function AvisoPrivacidadContenido() {
  return (
    <article className="aviso-privacidad">
      <header className="aviso-encabezado">
        <p className="aviso-etiqueta">Aviso integral</p>
        <h1>Aviso de privacidad</h1>
        <p className="aviso-subtitulo">
          Tratamiento responsable de datos personales conforme a la Ley Federal de Protección de
          Datos Personales en Posesión de los Particulares.
        </p>
        <dl className="aviso-meta">
          <div>
            <dt>Versión</dt>
            <dd>{AVISO_PRIVACIDAD_VERSION}</dd>
          </div>
          <div>
            <dt>Vigente a partir de</dt>
            <dd>
              <Pendiente>fecha de entrada en vigor</Pendiente>
            </dd>
          </div>
          <div>
            <dt>Última actualización</dt>
            <dd>{AVISO_PRIVACIDAD_ACTUALIZADO}</dd>
          </div>
        </dl>
        <p className="aviso-nota">
          Este aviso integra el aviso de privacidad de ASOMMMN y una sección específica para quienes
          se registran como postulantes en la Plataforma de Evaluación Curricular. Consulta también
          el{' '}
          <a href={URL_AVISO_GENERAL_ASOMMMN} target="_blank" rel="noopener noreferrer">
            aviso de privacidad general en asommmn.org.mx
            <i className="bi bi-box-arrow-up-right ms-1" aria-hidden="true" />
          </a>
          .
        </p>
      </header>

      <nav className="aviso-indice" aria-label="Contenido del aviso">
        <ol>
          <li><a href="#responsable">Responsable</a></li>
          <li><a href="#datos">Datos personales</a></li>
          <li><a href="#confidencialidad">Confidencialidad</a></li>
          <li><a href="#finalidades">Finalidades</a></li>
          <li><a href="#arco">Derechos ARCO</a></li>
          <li><a href="#plataforma">Plataforma de Evaluación Curricular (postulantes)</a></li>
          <li><a href="#cambios">Cambios al aviso</a></li>
        </ol>
      </nav>

      <h2 className="aviso-parte">I. Aviso de privacidad de ASOMMMN</h2>

      <Seccion id="responsable" titulo="Responsable">
        <p className="aviso-bajada">Protección de información personal y sindical</p>
        <p>
          ASOMMMN informa a sus miembros sobre el tratamiento de su información personal,
          garantizando protección, confidencialidad y uso limitado.
        </p>
        <p>
          Los datos pueden utilizarse para finalidades administrativas, sindicales, laborales,
          legales y de comunicación institucional.
        </p>
        <p>
          El responsable oficial tiene domicilio en Avenida Víctimas del 25 de Junio No. 176,
          Fraccionamiento Faros, C.P. 91709, Veracruz, Veracruz.
        </p>
        <ul className="aviso-contacto">
          <li>
            <strong>Responsable:</strong> ASOMMMN
          </li>
          <li>
            <strong>Correo:</strong> <Correo />
          </li>
          <li>
            <strong>Teléfonos:</strong> {TELEFONOS}
          </li>
        </ul>
      </Seccion>

      <Seccion id="datos" titulo="Datos personales">
        <ul>
          <li>
            Datos de identificación, contacto, trayectoria académica, trayectoria laboral,
            seguridad social, RFC y datos bancarios.
          </li>
          <li>Datos familiares necesarios para procesos administrativos o laborales.</li>
          <li>
            Datos sensibles como firma, examen médico, grupo sanguíneo, afiliación sindical, estudio
            socioeconómico y evaluación psicométrica.
          </li>
        </ul>
        <p>
          <strong>Datos sensibles.</strong> Estado de salud, información sindical y otros datos
          personales sensibles se tratan bajo medidas estrictas de seguridad y confidencialidad.
        </p>
      </Seccion>

      <Seccion id="confidencialidad" titulo="Confidencialidad">
        <p>No se divulgan datos salvo autorización expresa del titular o mandato legal aplicable.</p>
      </Seccion>

      <Seccion id="finalidades" titulo="Finalidades">
        <p>
          Evaluación de candidatos, obligaciones legales, fiscales, laborales, seguridad social y
          posibles procesos administrativos o judiciales.
        </p>
      </Seccion>

      <Seccion id="arco" titulo="Derechos ARCO">
        <p>
          Los miembros pueden acceder, rectificar, cancelar u oponerse al tratamiento de sus datos
          personales.
        </p>
        <p className="aviso-bajada">Solicitud de derechos ARCO</p>
        <p>
          Para solicitudes relacionadas con datos personales, usa el correo institucional de la
          asociación. La solicitud debe enviarse al correo institucional con datos de
          identificación y medio de notificación.
        </p>
        <ul className="aviso-contacto">
          <li>
            <strong>Correo:</strong> <Correo />
          </li>
          <li>
            <strong>Teléfonos ARCO:</strong> {TELEFONOS}
          </li>
          <li>
            <strong>Responsable:</strong> ASOMMMN
          </li>
        </ul>
      </Seccion>

      <h2 className="aviso-parte" id="plataforma">
        II. Plataforma de Evaluación Curricular (postulantes)
      </h2>
      <p>
        Esta sección aplica a quienes crean una cuenta de postulante en la Plataforma de
        Evaluación Curricular de ASOMMMN y complementa lo anterior. El responsable, el domicilio y
        los medios de contacto son los mismos de la Parte I.
      </p>

      <Seccion id="plataforma-datos" titulo="Datos que se piden">
        <ul>
          <li>
            <strong>Identificación:</strong> nombre, apellidos y fecha de nacimiento.
          </li>
          <li>
            <strong>Contacto:</strong> correo electrónico, teléfono, ciudad y país; de forma
            opcional, el enlace a tu perfil profesional.
          </li>
          <li>
            <strong>Trayectoria académica y laboral:</strong> currículum, experiencia, vacante de
            interés y bitácora de embarque.
          </li>
          <li>
            <strong>Certificaciones y cursos</strong> STCW/OMI y demás constancias de formación, con
            sus fechas de emisión y vencimiento.
          </li>
          <li>
            <strong>Documentos de identidad:</strong> credencial para votar (INE), CURP, pasaporte y
            visa. Estos documentos contienen, entre otros, fotografía, firma y números de
            identificación, por lo que se tratan con las mismas medidas que los datos sensibles.
          </li>
          <li>
            <strong>Datos técnicos de uso:</strong> dirección IP, navegador y fecha y hora de
            acceso, que se registran por seguridad.
          </li>
        </ul>
      </Seccion>

      <Seccion id="plataforma-finalidades" titulo="Finalidades">
        <p>
          <strong>Primarias</strong> (necesarias para el proceso; sin ellas no podemos evaluar tu
          postulación):
        </p>
        <ul>
          <li>Crear y administrar tu cuenta de postulante.</li>
          <li>
            Integrar tu expediente y realizar la evaluación curricular dentro del proceso de
            reclutamiento.
          </li>
          <li>Verificar la vigencia de tus documentos, certificaciones y cursos.</li>
          <li>
            Comunicarte el estado de tu postulación y avisos del proceso, como documentos por
            vencer.
          </li>
          <li>
            Proteger la plataforma: bitácora de accesos, verificación contra accesos automatizados
            (bots) y prevención de abusos.
          </li>
        </ul>
        <p>
          <strong>Secundarias:</strong> <Pendiente>finalidades secundarias, si las hay</Pendiente>.
          Si existieran, puedes negarte a ellas en cualquier momento escribiendo a <Correo />, sin
          que eso afecte tu evaluación.
        </p>
      </Seccion>

      <Seccion id="plataforma-ia" titulo="Uso de inteligencia artificial">
        <p>
          Para agilizar la revisión, la plataforma usa herramientas de inteligencia artificial de
          un proveedor externo para leer las fechas de tus documentos, certificados y cursos (por
          ejemplo, emisión y vencimiento) y los datos de tu currículum. Para ello, el archivo o su
          contenido se envía a ese proveedor, que lo procesa por cuenta de ASOMMMN.
        </p>
        <p>
          Las fechas que obtiene la herramienta son revisadas por un evaluador de ASOMMMN; la
          decisión sobre tu postulación la toman personas, no la herramienta. El asistente de chat
          de la plataforma también se apoya en ese proveedor: evita escribir en él datos personales
          que no sean necesarios.
        </p>
        <p>
          Proveedor y país donde procesa la información:{' '}
          <Pendiente>nombre del proveedor de IA y ubicación</Pendiente>.
        </p>
      </Seccion>

      <Seccion id="plataforma-encargados" titulo="Encargados y proveedores de infraestructura">
        <p>
          Para operar la plataforma, ASOMMMN se apoya en proveedores que alojan o procesan los datos
          únicamente por su cuenta y bajo sus instrucciones (encargados):
        </p>
        <ul>
          <li>Almacenamiento en la nube de documentos y archivos.</li>
          <li>Base de datos en la nube.</li>
          <li>Servidores de la aplicación y del sitio web.</li>
          <li>Envío de correos electrónicos.</li>
          <li>Verificación contra accesos automatizados (bots).</li>
          <li>Inteligencia artificial para leer fechas (ver sección anterior).</li>
        </ul>
        <p>
          Estos servicios pueden ubicarse fuera de México, por ejemplo en Estados Unidos. Nombre de
          cada proveedor y país: <Pendiente>lista de encargados y su ubicación</Pendiente>.
        </p>
      </Seccion>

      <Seccion id="plataforma-transferencias" titulo="Transferencias">
        <p>
          No se divulgan datos salvo autorización expresa del titular o mandato legal aplicable.
          Los encargados de la sección anterior no son transferencias: tratan los datos por cuenta
          de ASOMMMN.
        </p>
        <p>
          Terceros a quienes se transfieren datos de postulantes, finalidad y si requieren tu
          consentimiento:{' '}
          <Pendiente>
            indicar si el expediente se comparte con empresas navieras, empleadores u otros
            terceros, o declarar que no se realizan transferencias
          </Pendiente>
          .
        </p>
      </Seccion>

      <Seccion id="plataforma-conservacion" titulo="Conservación y eliminación">
        <p>
          Los datos y documentos de candidatos no seleccionados se conservarán durante{' '}
          <Pendiente>plazo de conservación</Pendiente> a partir de{' '}
          <Pendiente>momento desde el que se cuenta, p. ej. el cierre del proceso</Pendiente>. Al
          término de ese plazo se eliminarán o se anonimizarán.
        </p>
        <p>
          Las cuentas sin actividad se conservarán durante{' '}
          <Pendiente>plazo para cuentas inactivas</Pendiente>. Puedes pedir la eliminación de tus
          datos antes de esos plazos mediante una solicitud de cancelación (derechos ARCO), salvo
          los que ASOMMMN deba conservar por una obligación legal.
        </p>
      </Seccion>

      <Seccion id="plataforma-arco" titulo="Revocación del consentimiento y derechos ARCO">
        <p>
          Puedes revocar en cualquier momento el consentimiento que otorgaste y ejercer tus
          derechos de acceso, rectificación, cancelación u oposición escribiendo a <Correo /> o
          llamando al {TELEFONOS}. En tu solicitud incluye:
        </p>
        <ul>
          <li>Tu nombre y el correo con el que te registraste en la plataforma.</li>
          <li>Un documento que acredite tu identidad o, en su caso, la de tu representante.</li>
          <li>Qué derecho quieres ejercer y sobre qué datos.</li>
          <li>El medio por el que quieres recibir la respuesta.</li>
        </ul>
        <p>
          ASOMMMN te responderá en un plazo máximo de 20 días contados desde que reciba tu
          solicitud y, si resulta procedente, la hará efectiva dentro de los 15 días siguientes.
        </p>
        <p>
          Si revocas tu consentimiento para las finalidades primarias, no podremos continuar con tu
          evaluación curricular.
        </p>
      </Seccion>

      <Seccion id="plataforma-cookies" titulo="Cookies de sesión">
        <p>La plataforma usa solo las cookies necesarias para funcionar:</p>
        <ul>
          <li>
            <strong>Sesión</strong> (<code>refresh_token</code>): mantiene tu sesión iniciada hasta
            por 7 días. Tu navegador no permite leerla desde páginas web (httpOnly).
          </li>
          <li>
            <strong>Rol</strong> (<code>user_role</code>): recuerda si entraste como postulante,
            evaluador o administrador para mostrarte tus pantallas. Se borra al cerrar sesión.
          </li>
        </ul>
        <p>
          No usamos cookies de publicidad ni de analítica. La verificación contra bots del inicio
          de sesión, el registro y la recuperación de contraseña puede procesar datos técnicos de
          tu navegador para distinguir a personas de programas automatizados. Puedes borrar las
          cookies desde tu navegador; si lo haces, tendrás que volver a iniciar sesión.
        </p>
      </Seccion>

      <Seccion id="plataforma-consentimiento" titulo="Consentimiento">
        <p>
          Al marcar la casilla «He leído y acepto el Aviso de Privacidad» al registrarte, o al
          pulsar «Aceptar y continuar» al iniciar sesión, otorgas tu consentimiento expreso para el
          tratamiento de tus datos personales, incluidos tus documentos de identidad, en los
          términos de este aviso. La plataforma guarda la versión aceptada, la fecha y hora y la
          dirección IP desde la que la aceptaste.
        </p>
      </Seccion>

      <h2 className="aviso-parte">Cambios al aviso</h2>
      <Seccion id="cambios" titulo="Actualizaciones">
        <p>
          ASOMMMN informa que puede actualizar el aviso por cambios legales, políticas internas o
          nuevos requerimientos.
        </p>
        <p>
          Cuando cambie, publicaremos la nueva versión en esta página, con su número de versión y
          fecha, y te pediremos aceptarla la siguiente vez que inicies sesión en la plataforma.
        </p>
      </Seccion>

      <footer className="aviso-pie">
        <p className="mb-0">
          Versión {AVISO_PRIVACIDAD_VERSION} · Última actualización: {AVISO_PRIVACIDAD_ACTUALIZADO} ·{' '}
          <a href={URL_AVISO_GENERAL_ASOMMMN} target="_blank" rel="noopener noreferrer">
            Aviso general de ASOMMMN
          </a>
        </p>
      </footer>
    </article>
  );
}
