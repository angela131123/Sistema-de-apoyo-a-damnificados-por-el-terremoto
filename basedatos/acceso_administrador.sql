USE Sistema_apoyo_damnificados_terremoto_BD;

CREATE TABLE IF NOT EXISTS cuentas_administrador (
    id_cuenta INT AUTO_INCREMENT PRIMARY KEY,
    usuario VARCHAR(80) NOT NULL UNIQUE,
    clave_hash VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reportes_afectacion (
    id_damnificado INT PRIMARY KEY,
    descripcion VARCHAR(1000) NOT NULL,
    FOREIGN KEY (id_damnificado) REFERENCES damnificados(id_damnificado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS avisos_whatsapp (
    id_damnificado INT PRIMARY KEY,
    fecha_confirmacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_damnificado) REFERENCES damnificados(id_damnificado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS seguimiento_damnificados (
    id_damnificado INT PRIMARY KEY,
    estado ENUM('pendiente', 'sin_contacto', 'no_cumple') NOT NULL,
    motivo VARCHAR(250),
    FOREIGN KEY (id_damnificado) REFERENCES damnificados(id_damnificado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fotos_damnificados (
    id_foto INT AUTO_INCREMENT PRIMARY KEY,
    id_damnificado INT NOT NULL,
    tipo_mime VARCHAR(20) NOT NULL,
    contenido MEDIUMBLOB NOT NULL,
    FOREIGN KEY (id_damnificado) REFERENCES damnificados(id_damnificado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ofertas_donacion (
    id_oferta INT AUTO_INCREMENT PRIMARY KEY,
    id_donante INT NOT NULL,
    id_recurso INT NOT NULL,
    cantidad DECIMAL(10,2) NOT NULL,
    fecha_oferta DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observaciones VARCHAR(250),
    FOREIGN KEY (id_donante) REFERENCES donantes(id_donante),
    FOREIGN KEY (id_recurso) REFERENCES recursos(id_recurso),
    CHECK (cantidad > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recepciones_donacion (
    id_donacion INT PRIMARY KEY,
    id_oferta INT UNIQUE,
    id_solicitud CHAR(36) NOT NULL UNIQUE,
    FOREIGN KEY (id_donacion) REFERENCES donaciones(id_donacion),
    FOREIGN KEY (id_oferta) REFERENCES ofertas_donacion(id_oferta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS entregas_confirmadas (
    id_entrega INT PRIMARY KEY,
    id_necesidad INT NOT NULL,
    id_solicitud CHAR(36) NOT NULL UNIQUE,
    FOREIGN KEY (id_entrega) REFERENCES entregas(id_entrega),
    FOREIGN KEY (id_necesidad) REFERENCES necesidades(id_necesidad)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO recursos (nombre, categoria, unidad_medida) VALUES
    ('Agua potable', 'Alimentación', 'litros'),
    ('Alimentos no perecederos', 'Alimentación', 'paquetes'),
    ('Kit de higiene', 'Higiene', 'kits'),
    ('Ropa', 'Vestuario', 'prendas'),
    ('Cobijas', 'Alojamiento', 'unidades'),
    ('Colchonetas', 'Alojamiento', 'unidades'),
    ('Cupo de alojamiento temporal', 'Alojamiento', 'personas'),
    ('Otros recursos', 'Otros', 'unidades')
ON DUPLICATE KEY UPDATE id_recurso = id_recurso;

