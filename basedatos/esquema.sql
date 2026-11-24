CREATE TABLE IF NOT EXISTS albergues (
    id_albergue INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    direccion TEXT NOT NULL,
    capacidad INTEGER NOT NULL,
    telefono TEXT,
    CHECK (capacidad > 0)
);

-- Personas afectadas
CREATE TABLE IF NOT EXISTS damnificados (
    id_damnificado INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_documento TEXT COLLATE NOCASE,
    numero_documento TEXT COLLATE NOCASE,
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    fecha_nacimiento TEXT,
    telefono TEXT,
    direccion_afectada TEXT,
    fecha_registro TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_albergue INTEGER REFERENCES albergues(id_albergue),
    tipo_de_damnificacion TEXT,
    UNIQUE (tipo_documento, numero_documento)
);

-- Catálogo de recursos
CREATE TABLE IF NOT EXISTS recursos (
    id_recurso INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    categoria TEXT NOT NULL,
    unidad_medida TEXT NOT NULL,
    UNIQUE (nombre, unidad_medida)
);

-- Necesidades reportadas por cada persona
CREATE TABLE IF NOT EXISTS necesidades (
    id_necesidad INTEGER PRIMARY KEY AUTOINCREMENT,
    id_damnificado INTEGER NOT NULL REFERENCES damnificados(id_damnificado),
    id_recurso INTEGER NOT NULL REFERENCES recursos(id_recurso),
    cantidad_solicitada NUMERIC NOT NULL,
    prioridad TEXT NOT NULL DEFAULT 'Media' CHECK (prioridad IN ('Alta', 'Media', 'Baja')),
    estado TEXT NOT NULL DEFAULT 'Pendiente' CHECK (estado IN ('Pendiente', 'Parcial', 'Atendida')),
    fecha_registro TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observaciones TEXT,
    CHECK (cantidad_solicitada > 0)
);

-- Personas u organizaciones que donan
CREATE TABLE IF NOT EXISTS donantes (
    id_donante INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('Persona', 'Organizacion')),
    telefono TEXT,
    correo TEXT
);

-- Entradas de recursos
CREATE TABLE IF NOT EXISTS donaciones (
    id_donacion INTEGER PRIMARY KEY AUTOINCREMENT,
    id_donante INTEGER REFERENCES donantes(id_donante),
    id_recurso INTEGER NOT NULL REFERENCES recursos(id_recurso),
    cantidad NUMERIC NOT NULL,
    fecha_donacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observaciones TEXT,
    CHECK (cantidad > 0)
);

-- Salidas de recursos
CREATE TABLE IF NOT EXISTS entregas (
    id_entrega INTEGER PRIMARY KEY AUTOINCREMENT,
    id_damnificado INTEGER NOT NULL REFERENCES damnificados(id_damnificado),
    id_recurso INTEGER NOT NULL REFERENCES recursos(id_recurso),
    cantidad NUMERIC NOT NULL,
    fecha_entrega TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responsable TEXT NOT NULL,
    observaciones TEXT,
    CHECK (cantidad > 0)
);

CREATE TABLE IF NOT EXISTS cuentas_administrador (
    id_cuenta INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT COLLATE NOCASE NOT NULL UNIQUE,
    clave_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reportes_afectacion (
    id_damnificado INTEGER PRIMARY KEY REFERENCES damnificados(id_damnificado),
    descripcion TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS avisos_whatsapp (
    id_damnificado INTEGER PRIMARY KEY REFERENCES damnificados(id_damnificado),
    fecha_confirmacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seguimiento_damnificados (
    id_damnificado INTEGER PRIMARY KEY REFERENCES damnificados(id_damnificado),
    estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'sin_contacto', 'no_cumple')),
    motivo TEXT
);

CREATE TABLE IF NOT EXISTS fotos_damnificados (
    id_foto INTEGER PRIMARY KEY AUTOINCREMENT,
    id_damnificado INTEGER NOT NULL REFERENCES damnificados(id_damnificado),
    tipo_mime TEXT NOT NULL,
    contenido BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS ofertas_donacion (
    id_oferta INTEGER PRIMARY KEY AUTOINCREMENT,
    id_donante INTEGER NOT NULL REFERENCES donantes(id_donante),
    id_recurso INTEGER NOT NULL REFERENCES recursos(id_recurso),
    cantidad NUMERIC NOT NULL,
    fecha_oferta TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observaciones TEXT,
    CHECK (cantidad > 0)
);

CREATE TABLE IF NOT EXISTS recepciones_donacion (
    id_donacion INTEGER PRIMARY KEY REFERENCES donaciones(id_donacion),
    id_oferta INTEGER UNIQUE REFERENCES ofertas_donacion(id_oferta),
    id_solicitud TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS entregas_confirmadas (
    id_entrega INTEGER PRIMARY KEY REFERENCES entregas(id_entrega),
    id_necesidad INTEGER NOT NULL REFERENCES necesidades(id_necesidad),
    id_solicitud TEXT NOT NULL UNIQUE
);

INSERT INTO recursos (nombre, categoria, unidad_medida) VALUES
    ('Agua potable', 'Alimentación', 'litros'),
    ('Alimentos no perecederos', 'Alimentación', 'paquetes'),
    ('Kit de higiene', 'Higiene', 'kits'),
    ('Ropa', 'Vestuario', 'prendas'),
    ('Cobijas', 'Alojamiento', 'unidades'),
    ('Colchonetas', 'Alojamiento', 'unidades'),
    ('Cupo de alojamiento temporal', 'Alojamiento', 'personas'),
    ('Otros recursos', 'Otros', 'unidades')
ON CONFLICT (nombre, unidad_medida) DO NOTHING;
