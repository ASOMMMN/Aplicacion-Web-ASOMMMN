import {
  _usarEscritor,
  detenerVigilante,
  fase,
  faseEnCurso,
  hostMongo,
  iniciarVigilante,
  lineaArranque,
} from './fases-arranque';

describe('fases de arranque', () => {
  let lineas: string[];
  beforeEach(() => {
    lineas = [];
    _usarEscritor((l) => lineas.push(l));
  });
  afterEach(() => {
    detenerVigilante();
    jest.useRealTimers();
  });

  it('cada fase escribe una línea con tiempo, memoria y nombre de fase', () => {
    fase('mongo', 'conectando a MongoDB (cluster0.x.mongodb.net)');
    expect(faseEnCurso()).toBe('mongo');
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatch(
      /^\[arranque\] t=\d+\.\ds rss=\d+MB fase=mongo conectando a MongoDB \(cluster0\.x\.mongodb\.net\)$/,
    );
    expect(lineaArranque('init', 'x')).toContain('fase=init x');
  });

  it('el vigilante repite la fase en curso hasta que se detiene', () => {
    jest.useFakeTimers();
    fase('nest', 'creando la aplicación');
    iniciarVigilante(30_000);
    jest.advanceTimersByTime(65_000);
    const avisos = lineas.filter((l) => l.includes('sigue en esta fase'));
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toContain('fase=nest');
    expect(avisos[0]).toContain('puerto aún sin abrir');

    detenerVigilante();
    jest.advanceTimersByTime(120_000);
    expect(lineas.filter((l) => l.includes('sigue en esta fase'))).toHaveLength(
      2,
    );
  });

  it.each([
    [
      'mongodb+srv://user:p%40ss@cluster0.ab.mongodb.net/asommmn?retryWrites=true',
      'cluster0.ab.mongodb.net',
    ],
    [
      'mongodb://u:secreto@h1:27017,h2:27017/db?replicaSet=rs',
      'h1:27017,h2:27017',
    ],
    ['mongodb://127.0.0.1:27018/asommmn_dev', '127.0.0.1:27018'],
    [undefined, '(sin MONGODB_URI)'],
  ])('hostMongo(%s) no expone credenciales', (uri, esperado) => {
    const host = hostMongo(uri);
    expect(host).toBe(esperado);
    expect(host).not.toMatch(/secreto|p%40ss|user:/);
  });
});
