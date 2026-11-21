const path = require('node:path');
const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const express = require('express');
const session = require('express-session');
const mysql = require('mysql2/promise');
const multer = require('multer');

const scryptAsync = promisify(scrypt);
const root = path.resolve(__dirname, '..');
const database = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: 'Sistema_apoyo_damnificados_terremoto_BD',
  charset: 'utf8mb4',
  dateStrings: true,
});

const fields = [
  ['tipo_documento', 'Tipo de documento', 'text', 20, true],
  ['numero_documento', 'Número de documento', 'text', 30, true],
  ['nombres', 'Nombres', 'text', 100, true],
  ['apellidos', 'Apellidos', 'text', 100, true],
  ['fecha_nacimiento', 'Fecha de nacimiento', 'date', 10, false],
  ['telefono', 'Teléfono', 'tel', 20, false],
  ['direccion_afectada', 'Dirección afectada', 'text', 200, false],
  ['tipo_de_damnificacion', 'Tipo de afectación', 'text', 100, false],
];
const availableResource = `(SELECT COALESCE(SUM(cantidad), 0) FROM donaciones WHERE id_recurso = r.id_recurso)
    - (SELECT COALESCE(SUM(cantidad), 0) FROM entregas WHERE id_recurso = r.id_recurso)`;
const deliveredForNeed = `(SELECT COALESCE(SUM(e.cantidad), 0) FROM entregas e
    LEFT JOIN entregas_confirmadas c ON c.id_entrega = e.id_entrega
    WHERE e.id_damnificado = n.id_damnificado AND e.id_recurso = n.id_recurso
      AND (c.id_necesidad = n.id_necesidad OR (c.id_entrega IS NULL AND NOT EXISTS (
        SELECT 1 FROM necesidades otra WHERE otra.id_damnificado = n.id_damnificado
          AND otra.id_recurso = n.id_recurso AND otra.id_necesidad <> n.id_necesidad
      ))))`;
const maxPhotos = 3;
const adminQueries = {
  albergues: {
    columns: { id_albergue: 'ID', nombre: 'Albergue', direccion: 'Dirección', capacidad: 'Capacidad',
      telefono: 'Teléfono', personas_asignadas: 'Personas asignadas' },
    sql: `SELECT a.id_albergue, a.nombre, a.direccion, a.capacidad, a.telefono,
                 (SELECT COUNT(*) FROM damnificados d WHERE d.id_albergue = a.id_albergue) AS personas_asignadas
          FROM albergues a ORDER BY a.nombre, a.id_albergue`,
  },
  donaciones: {
    columns: { id_donacion: 'ID', donante: 'Donante', recurso: 'Recurso', cantidad: 'Cantidad',
      unidad_medida: 'Unidad', fecha_donacion: 'Fecha de donación', origen: 'Origen', observaciones: 'Observaciones' },
    sql: `SELECT d.id_donacion, COALESCE(a.nombre, 'Sin donante registrado') AS donante, r.nombre AS recurso,
                 d.cantidad, r.unidad_medida, d.fecha_donacion, d.observaciones,
                 COALESCE(CONCAT('Oferta #', recepcion.id_oferta), 'Directa') AS origen
          FROM donaciones d LEFT JOIN donantes a ON a.id_donante = d.id_donante
          JOIN recursos r ON r.id_recurso = d.id_recurso
          LEFT JOIN recepciones_donacion recepcion ON recepcion.id_donacion = d.id_donacion
          ORDER BY d.fecha_donacion DESC, d.id_donacion DESC`,
  },
  donantes: {
    columns: { id_donante: 'ID', nombre: 'Donante', tipo: 'Tipo', telefono: 'Teléfono', correo: 'Correo' },
    sql: 'SELECT id_donante, nombre, tipo, telefono, correo FROM donantes ORDER BY nombre, id_donante',
  },
  ofertas: {
    columns: { id_oferta: 'ID', donante: 'Donante', telefono: 'Teléfono', correo: 'Correo', recurso: 'Recurso',
      cantidad: 'Cantidad', unidad_medida: 'Unidad', fecha_oferta: 'Fecha de oferta', observaciones: 'Observaciones' },
    sql: `SELECT o.id_oferta, d.nombre AS donante, d.telefono, d.correo, r.nombre AS recurso,
                 o.cantidad, r.unidad_medida, o.fecha_oferta, o.observaciones,
                 recibida.cantidad AS cantidad_recibida
          FROM ofertas_donacion o JOIN donantes d ON d.id_donante = o.id_donante
          JOIN recursos r ON r.id_recurso = o.id_recurso
          LEFT JOIN recepciones_donacion recepcion ON recepcion.id_oferta = o.id_oferta
          LEFT JOIN donaciones recibida ON recibida.id_donacion = recepcion.id_donacion
          ORDER BY o.fecha_oferta DESC, o.id_oferta DESC`,
  },
  recursos: {
    columns: { id_recurso: 'ID', nombre: 'Recurso', categoria: 'Categoría', unidad_medida: 'Unidad', disponible: 'Disponible' },
    sql: `SELECT r.id_recurso, r.nombre, r.categoria, r.unidad_medida, ${availableResource} AS disponible
          FROM recursos r ORDER BY r.categoria, r.nombre, r.id_recurso`,
  },
  necesidades: {
    columns: { id_necesidad: 'ID', damnificado: 'Damnificado', recurso: 'Recurso',
      cantidad_solicitada: 'Cantidad solicitada', unidad_medida: 'Unidad', prioridad: 'Prioridad',
      estado: 'Estado', pendiente: 'Cantidad pendiente', fecha_registro: 'Fecha de registro', observaciones: 'Observaciones' },
    sql: `SELECT n.id_necesidad, CONCAT_WS(' ', d.nombres, d.apellidos) AS damnificado, r.nombre AS recurso,
                 n.cantidad_solicitada, r.unidad_medida, n.prioridad, n.estado, n.fecha_registro, n.observaciones,
                 CASE WHEN n.estado = 'Atendida' THEN 0
                   ELSE GREATEST(0, n.cantidad_solicitada - ${deliveredForNeed}) END AS pendiente
          FROM necesidades n JOIN damnificados d ON d.id_damnificado = n.id_damnificado
          JOIN recursos r ON r.id_recurso = n.id_recurso ORDER BY n.fecha_registro DESC, n.id_necesidad DESC`,
  },
  entregas: {
    columns: { id_entrega: 'ID', damnificado: 'Damnificado', recurso: 'Recurso', cantidad: 'Cantidad',
      unidad_medida: 'Unidad', fecha_entrega: 'Fecha de entrega', responsable: 'Responsable', observaciones: 'Observaciones' },
    sql: `SELECT e.id_entrega, CONCAT_WS(' ', d.nombres, d.apellidos) AS damnificado, r.nombre AS recurso,
                 e.cantidad, r.unidad_medida, e.fecha_entrega, e.responsable, e.observaciones
          FROM entregas e JOIN damnificados d ON d.id_damnificado = e.id_damnificado
          JOIN recursos r ON r.id_recurso = e.id_recurso ORDER BY e.fecha_entrega DESC, e.id_entrega DESC`,
  },
  colaboradores: {
    columns: { id_cuenta: 'ID', usuario: 'Usuario administrador' },
    sql: 'SELECT id_cuenta, usuario FROM cuentas_administrador ORDER BY usuario',
  },
};
const maxPhotoBytes = 3 * 1024 * 1024;
const uploadPhotos = multer({
  storage: multer.memoryStorage(),
  limits: { files: maxPhotos, fileSize: maxPhotoBytes + 1, fields: fields.length + 5, fieldSize: 4096 },
}).array('fotos', maxPhotos);

function photoType(bytes) {
  if (bytes.length >= 4 && bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'image/jpeg';
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
      bytes.toString('ascii', 12, 16) === 'IHDR') return 'image/png';
  if (bytes.length >= 16 && bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function reject(response, status, message) {
  return response.status(status).json({ message });
}

function field(body, name) {
  return typeof body?.[name] === 'string' ? body[name].trim() : '';
}

function validId(id) {
  return /^[1-9]\d{0,9}$/.test(id) && Number(id) <= 2147483647;
}

function validQuantity(quantity) {
  return /^\d{1,8}(\.\d{1,2})?$/.test(quantity) && Number(quantity) > 0;
}

function validRequestId(id) {
  return /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);
}

function validResource(resource, quantity) {
  return validId(resource) && validQuantity(quantity);
}

async function inTransaction(db, save) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await save(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function enforceCsrf(request, response, next) {
  if (!request.session.csrf || request.get('X-CSRF-Token') !== request.session.csrf) {
    return reject(response, 403, 'La solicitud expiró. Vuelve a abrir la página.');
  }
  next();
}

async function passwordHash(password, salt) {
  return scryptAsync(password, salt, 64);
}

async function createAdmin() {
  const username = process.argv[3] || '';
  const password = process.env.ADMIN_PASSWORD || '';
  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(username) || password.length < 12 || password.length > 128) {
    throw new Error('Usa un nombre de usuario de 3 a 80 caracteres y una contraseña de 12 a 128 caracteres.');
  }
  const salt = randomBytes(16).toString('hex');
  const hash = await passwordHash(password, salt);
  await database.execute('INSERT INTO cuentas_administrador (usuario, clave_hash) VALUES (?, ?)', [
    username, salt + ':' + hash.toString('hex'),
  ]);
  console.log('Cuenta de administrador creada.');
}

function formDate() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Bogota' }).format(new Date());
}

function groupByPerson(rows) {
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.id_damnificado)) grouped.set(row.id_damnificado, []);
    grouped.get(row.id_damnificado).push(row);
  }
  return Object.fromEntries(grouped);
}

function createApp(db = database) {
  const app = express();
  async function requireAdmin(request, response, next) {
    if (!request.session.admin) return reject(response, 403, 'Inicia sesión como administrador.');
    const [[account]] = await db.execute('SELECT usuario FROM cuentas_administrador WHERE id_cuenta = ?', [
      request.session.admin,
    ]);
    if (!account) {
      delete request.session.admin;
      return reject(response, 403, 'La cuenta de administrador ya no está registrada.');
    }
    request.adminUser = account.usuario;
    next();
  }

  app.disable('x-powered-by');
  app.use('/css', express.static(path.join(root, 'css')));
  app.use('/img', express.static(path.join(root, 'img')));
  app.get('/js/formulario.js', (request, response) => response.sendFile(path.join(__dirname, 'formulario.js')));
  app.get('/js/administrador.js', (request, response) => response.sendFile(path.join(__dirname, 'administrador.js')));
  app.get('/js/recursos.js', (request, response) => response.sendFile(path.join(__dirname, 'recursos.js')));
  app.get('/js/donaciones.js', (request, response) => response.sendFile(path.join(__dirname, 'donaciones.js')));
  app.get(['/', '/index.html'], (request, response) => response.sendFile(path.join(root, 'index.html')));
  app.get(['/formulario', '/formulario.html'], (request, response) => response.sendFile(path.join(root, 'formulario.html')));
  app.get('/donaciones.html', (request, response) => response.sendFile(path.join(root, 'donaciones.html')));
  app.get(['/administrador', '/administrador.html'], (request, response) => response.sendFile(path.join(root, 'administrador.html')));
  app.use('/api', express.json({ limit: '8kb' }));
  app.use(session({
    name: 'apoyo_damnificados',
    secret: process.env.SESSION_SECRET || randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: 'auto', maxAge: 8 * 60 * 60 * 1000 },
  }));
  app.use('/api', (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/sesion', (request, response) => {
    request.session.csrf ??= randomBytes(32).toString('hex');
    response.json({
      csrf: request.session.csrf, admin: Boolean(request.session.admin), today: formDate(), maxPhotos, maxPhotoBytes,
    });
  });

  app.get('/api/recursos', async (request, response) => {
    const [rows] = await db.query('SELECT id_recurso, nombre, unidad_medida FROM recursos ORDER BY nombre, id_recurso');
    response.json(rows);
  });

  app.post('/api/damnificados', enforceCsrf, (request, response, next) => {
    if (!request.is('multipart/form-data')) return reject(response, 415, 'Envía los datos desde el formulario.');
    uploadPhotos(request, response, (error) => {
      if (!error) return next();
      if (!(error instanceof multer.MulterError)) return next(error);
      reject(response, 422, 'Revisa los datos y adjunta hasta 3 fotos de máximo 3 MB cada una.');
    });
  }, async (request, response) => {
    const today = formDate();
    const values = Object.fromEntries(fields.map(([name]) => [name, field(request.body, name)]));
    values.descripcion = field(request.body, 'descripcion');
    const resource = field(request.body, 'id_recurso');
    const quantity = field(request.body, 'cantidad');
    const priority = field(request.body, 'prioridad');
    const need = field(request.body, 'observaciones_necesidad');

    for (const [name, label, type, max, required] of fields) {
      const value = values[name];
      if ((required && !value) || [...value].length > max) {
        return reject(response, 422, 'Revisa el campo «' + label + '».');
      }
      if (type === 'date' && value) {
        const date = new Date(value + 'T00:00:00Z');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) ||
            date.toISOString().slice(0, 10) !== value || value > today || value < '1000-01-01') {
          return reject(response, 422, 'Ingresa una fecha de nacimiento válida.');
        }
      }
    }
    if ([...values.descripcion].length > 1000) return reject(response, 422, 'La descripción admite hasta 1000 caracteres.');
    if (!validResource(resource, quantity) || !['Alta', 'Media', 'Baja'].includes(priority) || [...need].length > 250) {
      return reject(response, 422, 'Selecciona un recurso, indica la cantidad y elige la prioridad de la necesidad.');
    }
    const photos = request.files.map(({ buffer }) => ({ buffer, type: photoType(buffer) }));
    if (photos.some(({ buffer, type }) => !type || buffer.length > maxPhotoBytes)) {
      return reject(response, 422, 'Selecciona fotos JPG, PNG o WebP de máximo 3 MB cada una.');
    }
    try {
      await inTransaction(db, async (connection) => {
        const [result] = await connection.execute(
          `INSERT INTO damnificados (tipo_documento, numero_documento, nombres, apellidos,
            fecha_nacimiento, telefono, direccion_afectada, tipo_de_damnificacion)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          fields.map(([name]) => values[name] || null),
        );
        if (values.descripcion) {
          await connection.execute(
            'INSERT INTO reportes_afectacion (id_damnificado, descripcion) VALUES (?, ?)',
            [result.insertId, values.descripcion],
          );
        }
        await connection.execute(
          `INSERT INTO necesidades (id_damnificado, id_recurso, cantidad_solicitada, prioridad, observaciones)
           VALUES (?, ?, ?, ?, ?)`,
          [result.insertId, resource, quantity, priority, need || null],
        );
        for (const { type, buffer } of photos) {
          await connection.execute(
            'INSERT INTO fotos_damnificados (id_damnificado, tipo_mime, contenido) VALUES (?, ?, ?)',
            [result.insertId, type, buffer],
          );
        }
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') return reject(response, 409, 'Ya existe un registro con ese documento.');
      if (error.code === 'ER_NO_REFERENCED_ROW_2') return reject(response, 422, 'El recurso seleccionado ya no existe.');
      throw error;
    }
    response.status(201).json({ message: 'Tus datos y tu necesidad se guardaron correctamente.' });
  });

  app.post('/api/ofertas-donacion', enforceCsrf, async (request, response) => {
    const name = field(request.body, 'nombre');
    const type = field(request.body, 'tipo');
    const phone = field(request.body, 'telefono');
    const email = field(request.body, 'correo');
    const resource = field(request.body, 'id_recurso');
    const quantity = field(request.body, 'cantidad');
    const notes = field(request.body, 'observaciones');
    if (!name || [...name].length > 150 || !['Persona', 'Organizacion'].includes(type) ||
        (!phone && !email) || phone.length > 20 || email.length > 100 ||
        (phone && (!/^\+?[0-9 ()-]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g, '')))) ||
        (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
        !validResource(resource, quantity) || [...notes].length > 250) {
      return reject(response, 422, 'Revisa tus datos e indica un teléfono o correo, un recurso y una cantidad válida.');
    }
    try {
      await inTransaction(db, async (connection) => {
        const [donor] = await connection.execute(
          'INSERT INTO donantes (nombre, tipo, telefono, correo) VALUES (?, ?, ?, ?)',
          [name, type, phone || null, email || null],
        );
        await connection.execute(
          'INSERT INTO ofertas_donacion (id_donante, id_recurso, cantidad, observaciones) VALUES (?, ?, ?, ?)',
          [donor.insertId, resource, quantity, notes || null],
        );
      });
    } catch (error) {
      if (error.code === 'ER_NO_REFERENCED_ROW_2') return reject(response, 422, 'El recurso seleccionado ya no existe.');
      throw error;
    }
    response.status(201).json({ message: 'Tu oferta de donación se registró. El equipo podrá contactarte para coordinar la entrega.' });
  });

  app.get('/api/administrador/damnificados', requireAdmin, async (request, response) => {
    const [people] = await db.query(`
      SELECT d.*, a.nombre AS albergue, a.direccion AS direccion_albergue,
             reporte.descripcion, aviso.fecha_confirmacion AS aviso_whatsapp,
             seguimiento.estado AS estado_seguimiento, seguimiento.motivo AS motivo_seguimiento
      FROM damnificados d LEFT JOIN albergues a ON a.id_albergue = d.id_albergue
      LEFT JOIN reportes_afectacion reporte ON reporte.id_damnificado = d.id_damnificado
      LEFT JOIN avisos_whatsapp aviso ON aviso.id_damnificado = d.id_damnificado
      LEFT JOIN seguimiento_damnificados seguimiento ON seguimiento.id_damnificado = d.id_damnificado
      ORDER BY d.fecha_registro DESC, d.id_damnificado DESC`);
    const [photos] = await db.query('SELECT id_damnificado, id_foto FROM fotos_damnificados ORDER BY id_foto');
    const [shelters] = await db.query(adminQueries.albergues.sql);
    response.json({
      people, shelters, photos: groupByPerson(photos),
      labels: { ...Object.fromEntries(fields.map(([name, label]) => [name, label])),
        descripcion: 'Descripción de la afectación', fecha_registro: 'Fecha de registro' },
    });
  });

  app.get('/api/administrador/fotos/:id', requireAdmin, async (request, response) => {
    if (!validId(request.params.id)) return response.sendStatus(404);
    const [[photo]] = await db.execute('SELECT tipo_mime, contenido FROM fotos_damnificados WHERE id_foto = ?', [
      request.params.id,
    ]);
    if (!photo || photoType(photo.contenido) !== photo.tipo_mime) return response.sendStatus(404);
    response.set('X-Content-Type-Options', 'nosniff').type(photo.tipo_mime).send(photo.contenido);
  });

  app.get('/api/administrador/consultas/:seccion', requireAdmin, async (request, response) => {
    const section = request.params.seccion;
    if (!Object.hasOwn(adminQueries, section)) return reject(response, 404, 'Consulta no disponible.');
    const { columns, sql } = adminQueries[section];
    const [rows] = await db.query(sql);
    response.json({ columns, rows });
  });

  app.post('/api/administrador/donaciones', requireAdmin, enforceCsrf, async (request, response) => {
    const offerId = field(request.body, 'id_oferta');
    const receiptId = field(request.body, 'id_solicitud');
    const name = field(request.body, 'nombre');
    const type = field(request.body, 'tipo');
    const resourceId = field(request.body, 'id_recurso');
    const quantity = field(request.body, 'cantidad');
    const date = field(request.body, 'fecha');
    const notes = field(request.body, 'observaciones');
    const parsedDate = new Date(date + 'T00:00:00Z');

    if (!validRequestId(receiptId) ||
        !validQuantity(quantity) || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date ||
        date > formDate() || [...notes].length > 250) {
      return reject(response, 422, 'Revisa la cantidad y la fecha de recepción. Las observaciones admiten hasta 250 caracteres.');
    }
    if (offerId ? !validId(offerId) : !validId(resourceId) || !name || [...name].length > 150 ||
        !['Persona', 'Organizacion'].includes(type)) {
      return reject(response, 422, 'Selecciona una oferta válida o indica el donante y el recurso.');
    }

    try {
      const registered = await inTransaction(db, async (connection) => {
        let donor;
        let resource = resourceId;
        if (offerId) {
          const [[offer]] = await connection.execute(
            'SELECT id_donante, id_recurso FROM ofertas_donacion WHERE id_oferta = ?', [offerId],
          );
          if (!offer) return false;
          donor = offer.id_donante;
          resource = offer.id_recurso;
        } else {
          const [created] = await connection.execute(
            'INSERT INTO donantes (nombre, tipo) VALUES (?, ?)', [name, type],
          );
          donor = created.insertId;
        }
        const [donation] = await connection.execute(
          'INSERT INTO donaciones (id_donante, id_recurso, cantidad, fecha_donacion, observaciones) VALUES (?, ?, ?, ?, ?)',
          [donor, resource, quantity, date, notes || null],
        );
        await connection.execute(
          'INSERT INTO recepciones_donacion (id_donacion, id_oferta, id_solicitud) VALUES (?, ?, ?)',
          [donation.insertId, offerId || null, receiptId],
        );
        return true;
      });
      if (!registered) return reject(response, 404, 'La oferta no existe.');
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        const [[saved]] = await db.execute('SELECT id_oferta FROM recepciones_donacion WHERE id_solicitud = ?', [receiptId]);
        if (saved && String(saved.id_oferta ?? '') === offerId) {
          return response.json({ message: 'Donación recibida registrada.' });
        }
        return reject(response, 409, 'La recepción ya está registrada. Actualiza la sección para consultarla.');
      }
      if (error.code === 'ER_NO_REFERENCED_ROW_2') return reject(response, 422, 'El recurso o la oferta ya no existe.');
      throw error;
    }
    response.status(201).json({ message: 'Donación recibida registrada.' });
  });

  app.post('/api/administrador/albergues', requireAdmin, enforceCsrf, async (request, response) => {
    const name = field(request.body, 'nombre');
    const address = field(request.body, 'direccion');
    const capacity = field(request.body, 'capacidad');
    const phone = field(request.body, 'telefono');
    if (!name || [...name].length > 100 || !address || [...address].length > 200 ||
        !validId(capacity) || phone.length > 20) {
      return reject(response, 422, 'Ingresa el nombre, la dirección y una capacidad mayor que cero.');
    }
    const [result] = await db.execute(
      'INSERT INTO albergues (nombre, direccion, capacidad, telefono) VALUES (?, ?, ?, ?)',
      [name, address, capacity, phone || null],
    );
    response.status(201).json({ id: result.insertId, message: 'Albergue registrado.' });
  });

  app.post('/api/administrador/damnificados/:id/albergue', requireAdmin, enforceCsrf, async (request, response) => {
    const { id } = request.params;
    const shelterId = field(request.body, 'id_albergue');
    if (!validId(id)) return reject(response, 404, 'Registro no encontrado.');
    if (typeof request.body?.id_albergue !== 'string' || (shelterId && !validId(shelterId))) {
      return reject(response, 422, 'Selecciona un albergue válido.');
    }
    const result = await inTransaction(db, async (connection) => {
      const [[person]] = await connection.execute(
        'SELECT id_albergue FROM damnificados WHERE id_damnificado = ? FOR UPDATE', [id],
      );
      if (!person) return { status: 404, message: 'Registro no encontrado.' };
      if (shelterId && shelterId !== String(person.id_albergue)) {
        const [[shelter]] = await connection.execute('SELECT capacidad FROM albergues WHERE id_albergue = ? FOR UPDATE', [shelterId]);
        if (!shelter) return { status: 404, message: 'Albergue no encontrado.' };
        const [[{ occupied }]] = await connection.execute('SELECT COUNT(*) AS occupied FROM damnificados WHERE id_albergue = ?', [shelterId]);
        if (occupied >= shelter.capacidad) return { status: 409, message: 'El albergue ya alcanzó su capacidad.' };
      }
      await connection.execute('UPDATE damnificados SET id_albergue = ? WHERE id_damnificado = ?', [shelterId || null, id]);
      return { status: 200, message: shelterId ? 'Asignación guardada.' : 'El registro quedó sin albergue asignado.' };
    });
    response.status(result.status).json({ message: result.message });
  });

  app.post('/api/administrador/necesidades/:id/entregas', requireAdmin, enforceCsrf, async (request, response) => {
    const { id } = request.params;
    const quantity = field(request.body, 'cantidad');
    const requestId = field(request.body, 'id_solicitud');
    if (!validId(id)) return reject(response, 404, 'Necesidad no encontrada.');
    if (!validQuantity(quantity) || !validRequestId(requestId)) {
      return reject(response, 422, 'Indica una cantidad válida para la entrega.');
    }
    const result = await inTransaction(db, async (connection) => {
      const [[need]] = await connection.execute('SELECT * FROM necesidades WHERE id_necesidad = ? FOR UPDATE', [id]);
      if (!need) return { status: 404, message: 'Necesidad no encontrada.' };
      await connection.execute('SELECT id_recurso FROM recursos WHERE id_recurso = ? FOR UPDATE', [need.id_recurso]);
      const [[saved]] = await connection.execute(
        `SELECT c.id_necesidad, e.cantidad FROM entregas_confirmadas c JOIN entregas e USING (id_entrega)
         WHERE c.id_solicitud = ?`, [requestId],
      );
      if (saved) {
        return Number(saved.id_necesidad) === Number(id) && Number(saved.cantidad) === Number(quantity)
          ? { status: 200, message: 'Entrega registrada.' }
          : { status: 409, message: 'La solicitud corresponde a otra entrega. Actualiza la sección.' };
      }
      const [[{ delivered }]] = await connection.execute(
        `SELECT ${deliveredForNeed} AS delivered FROM necesidades n WHERE n.id_necesidad = ?`, [id],
      );
      const newTotal = Math.round(Number(delivered) * 100) + Math.round(Number(quantity) * 100);
      const requested = Math.round(Number(need.cantidad_solicitada) * 100);
      if (need.estado === 'Atendida' || newTotal > requested) {
        return { status: 409, message: 'La entrega supera la cantidad pendiente de la necesidad.' };
      }
      const [[{ available }]] = await connection.execute(
        `SELECT ${availableResource} AS available FROM recursos r WHERE r.id_recurso = ?`, [need.id_recurso],
      );
      if (Number(quantity) > Number(available)) {
        return { status: 409, message: 'La cantidad supera las existencias disponibles.' };
      }
      const [delivery] = await connection.execute(
        'INSERT INTO entregas (id_damnificado, id_recurso, cantidad, responsable) VALUES (?, ?, ?, ?)',
        [need.id_damnificado, need.id_recurso, quantity, request.adminUser],
      );
      await connection.execute(
        'INSERT INTO entregas_confirmadas (id_entrega, id_necesidad, id_solicitud) VALUES (?, ?, ?)',
        [delivery.insertId, id, requestId],
      );
      await connection.execute('UPDATE necesidades SET estado = ? WHERE id_necesidad = ?', [
        newTotal === requested ? 'Atendida' : 'Parcial', id,
      ]);
      return { status: 201, message: 'Entrega registrada.' };
    }).catch((error) => {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      return { status: 409, message: 'La solicitud corresponde a otra entrega. Actualiza la sección.' };
    });
    response.status(result.status).json({ message: result.message });
  });

  app.post('/api/administrador/damnificados/:id/seguimiento', requireAdmin, enforceCsrf, async (request, response) => {
    const { id } = request.params;
    if (!validId(id)) {
      return reject(response, 404, 'Registro no encontrado.');
    }
    const estado = field(request.body, 'estado');
    if (!['pendiente', 'sin_contacto', 'no_cumple'].includes(estado)) {
      return reject(response, 422, 'Selecciona un estado de seguimiento válido.');
    }
    const motivo = estado === 'pendiente' ? null : field(request.body, 'motivo');
    if (motivo !== null && (!motivo || [...motivo].length > 250)) {
      return reject(response, 422, 'Escribe un motivo de hasta 250 caracteres.');
    }
    try {
      await db.execute(
        `INSERT INTO seguimiento_damnificados (id_damnificado, estado, motivo) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE estado = VALUES(estado), motivo = VALUES(motivo)`,
        [id, estado, motivo],
      );
    } catch (error) {
      if (error.code === 'ER_NO_REFERENCED_ROW_2') return reject(response, 404, 'Registro no encontrado.');
      throw error;
    }
    response.json({ estado, motivo, message: 'Seguimiento guardado.' });
  });

  app.post('/api/administrador/damnificados/:id/confirmar-whatsapp', requireAdmin, enforceCsrf, async (request, response) => {
    const { id } = request.params;
    if (!validId(id)) return reject(response, 404, 'Registro no encontrado.');
    const [people] = await db.execute('SELECT telefono FROM damnificados WHERE id_damnificado = ?', [id]);
    if (!people.length) return reject(response, 404, 'Registro no encontrado.');
    if (!people[0].telefono?.trim()) return reject(response, 422, 'El registro no tiene teléfono.');
    await db.execute(
      `INSERT INTO avisos_whatsapp (id_damnificado) VALUES (?)
       ON DUPLICATE KEY UPDATE id_damnificado = id_damnificado`, [id],
    );
    response.json({ message: 'Información enviada por WhatsApp.' });
  });

  app.post('/api/administrador/ingresar', enforceCsrf, async (request, response) => {
    const { usuario, clave } = request.body || {};
    if (typeof usuario !== 'string' || typeof clave !== 'string' || usuario.length > 80 || clave.length > 128) {
      return reject(response, 401, 'El usuario o la contraseña son incorrectos.');
    }
    const [accounts] = await db.execute(
      'SELECT id_cuenta, clave_hash FROM cuentas_administrador WHERE usuario = ?', [usuario.trim()],
    );
    const account = accounts[0];
    const [salt, storedHash] = account?.clave_hash.split(':') ?? [];
    const validHash = /^[a-f0-9]{32}$/.test(salt) && /^[a-f0-9]{128}$/.test(storedHash);
    const actualHash = await passwordHash(clave, validHash ? salt : '0'.repeat(32));
    if (!validHash || !timingSafeEqual(actualHash, Buffer.from(storedHash, 'hex'))) {
      return reject(response, 401, 'El usuario o la contraseña son incorrectos.');
    }
    await promisify(request.session.regenerate).call(request.session);
    request.session.admin = account.id_cuenta;
    request.session.csrf = randomBytes(32).toString('hex');
    response.json({ csrf: request.session.csrf });
  });

  app.post('/api/administrador/salir', requireAdmin, enforceCsrf, async (request, response) => {
    await promisify(request.session.destroy).call(request.session);
    response.clearCookie('apoyo_damnificados');
    response.status(204).end();
  });

  app.use('/api', (request, response) => reject(response, 404, 'Esta opción no está disponible.'));

  app.use((error, request, response, next) => {
    if (response.headersSent) return next(error);
    if (error.status === 413 || error.status === 400) {
      return reject(response, error.status, 'No se pudo procesar la solicitud.');
    }
    console.error(error.code || error.message);
    reject(response, 503, 'El servicio no está disponible. Revisa la conexión con MySQL e intenta de nuevo.');
  });
  return app;
}

if (require.main === module) {
  if (process.argv[2] === 'crear-admin') {
    createAdmin().catch((error) => {
      console.error(error.code === 'ER_DUP_ENTRY' ? 'Ese usuario ya existe.' : error.message);
      process.exitCode = 1;
    }).finally(() => database.end());
  } else {
    const port = Number(process.env.PORT || 3000);
    createApp().listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port));
  }
}

module.exports = { createApp };
