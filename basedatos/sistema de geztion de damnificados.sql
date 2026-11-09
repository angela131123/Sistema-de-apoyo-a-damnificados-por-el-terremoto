create database Sistema_apoyo_damnificados_terremoto_BD;
use Sistema_apoyo_damnificados_terremoto_BD;


create  table Administrador(
	id_admin int auto_increment primary key,
	colaborador_nombre varchar (50),
	colaborador_apellido varchar(50),
    funcion varchar(100)
);
CREATE TABLE albergues (
    id_albergue INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    direccion VARCHAR(200) NOT NULL,
    capacidad INT NOT NULL,
    telefono VARCHAR(20),
    CHECK (capacidad > 0)
);

-- 2. Personas afectadas
CREATE TABLE damnificados (
    id_damnificado INT AUTO_INCREMENT PRIMARY KEY,
    tipo_documento VARCHAR(20),
    numero_documento VARCHAR(30),
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    fecha_nacimiento DATE,
    telefono VARCHAR(20),
    direccion_afectada VARCHAR(200),
    fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_albergue INT,

    UNIQUE (tipo_documento, numero_documento),

    FOREIGN KEY (id_albergue)
        REFERENCES albergues(id_albergue)
);

-- 3. Catálogo de recursos
CREATE TABLE recursos (
    id_recurso INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    unidad_medida VARCHAR(30) NOT NULL,

    UNIQUE (nombre, unidad_medida)
);

-- 4. Necesidades reportadas por cada persona
CREATE TABLE necesidades (
    id_necesidad INT AUTO_INCREMENT PRIMARY KEY,
    id_damnificado INT NOT NULL,
    id_recurso INT NOT NULL,
    cantidad_solicitada DECIMAL(10,2) NOT NULL,
    prioridad ENUM('Alta', 'Media', 'Baja') NOT NULL DEFAULT 'Media',
    estado ENUM('Pendiente', 'Parcial', 'Atendida')
        NOT NULL DEFAULT 'Pendiente',
    fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observaciones VARCHAR(250),

    FOREIGN KEY (id_damnificado)
        REFERENCES damnificados(id_damnificado),

    FOREIGN KEY (id_recurso)
        REFERENCES recursos(id_recurso),

    CHECK (cantidad_solicitada > 0)
);

-- 5. Personas u organizaciones que donan
CREATE TABLE donantes (
    id_donante INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    tipo ENUM('Persona', 'Organizacion') NOT NULL,
    telefono VARCHAR(20),
    correo VARCHAR(100)
);

-- 6. Entradas de recursos
CREATE TABLE donaciones (
    id_donacion INT AUTO_INCREMENT PRIMARY KEY,
    id_donante INT,
    id_recurso INT NOT NULL,
    cantidad DECIMAL(10,2) NOT NULL,
    fecha_donacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observaciones VARCHAR(250),

    FOREIGN KEY (id_donante)
        REFERENCES donantes(id_donante),

    FOREIGN KEY (id_recurso)
        REFERENCES recursos(id_recurso),

    CHECK (cantidad > 0)
);

-- 7. Salidas de recursos
CREATE TABLE entregas (
    id_entrega INT AUTO_INCREMENT PRIMARY KEY,
    id_damnificado INT NOT NULL,
    id_recurso INT NOT NULL,
    cantidad DECIMAL(10,2) NOT NULL,
    fecha_entrega DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responsable VARCHAR(150) NOT NULL,
    observaciones VARCHAR(250),

    FOREIGN KEY (id_damnificado)
        REFERENCES damnificados(id_damnificado),

    FOREIGN KEY (id_recurso)
        REFERENCES recursos(id_recurso),

    CHECK (cantidad > 0)
);