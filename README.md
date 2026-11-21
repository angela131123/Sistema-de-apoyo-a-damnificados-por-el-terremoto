# Sistema de apoyo a damnificados

Proyecto académico de Programación IV y Calidad del Desarrollo de Software, presentado por Angela Maria Taba Bueno. El sistema registra las necesidades de las personas afectadas por un terremoto en Pereira y organiza la distribución de la ayuda.

## Instalación local

1. Inicia **MySQL** en XAMPP. Para usar phpMyAdmin, inicia también **Apache** y abre `http://localhost/phpmyadmin`.
2. Si la base es nueva, importa `basedatos/sistema de geztion de damnificados.sql`. Luego importa `basedatos/acceso_administrador.sql` para crear las tablas adicionales y cargar el catálogo. Si ya tienes la base, importa solo `basedatos/acceso_administrador.sql` para aplicar los cambios conservando los registros.
3. Con Node.js 22 o posterior, abre PowerShell en la carpeta del proyecto y ejecuta `npm.cmd ci`.
4. Si necesitas acceso al panel, crea una cuenta de administrador.

   ```powershell
   $claveAdministrador = Read-Host 'Contraseña de administrador (mínimo 12 caracteres)' -AsSecureString
   $env:ADMIN_PASSWORD = [pscredential]::new('administrador', $claveAdministrador).GetNetworkCredential().Password
   try {
       npm.cmd run crear-admin -- administrador
   } finally {
       Remove-Item Env:ADMIN_PASSWORD
       $claveAdministrador.Dispose()
   }
   ```

5. Ejecuta `npm.cmd start` y abre `http://127.0.0.1:3000/`.

MySQL usa por defecto `127.0.0.1:3307`, usuario `root` y contraseña vacía. Si XAMPP usa el puerto 3306, ejecuta `$env:DB_PORT = '3306'` antes de crear la cuenta o iniciar el servidor. Para cambiar el host o las credenciales, usa `DB_HOST`, `DB_USER` o `DB_PASSWORD`.

## Uso

- **Registro.** Guarda tus datos, la ayuda que necesitas y hasta tres fotos opcionales.
- **Donación.** Ofrece un recurso y deja un contacto para coordinar la entrega. Consulta **Albergues y donaciones** para ver los canales oficiales.
- **Recepción de donaciones.** En **Donaciones**, registra los aportes directos. Si ya existe una oferta, abre **Ofertas de donación**, pulsa **Confirmar recepción** e indica cuánto llegó. Cada oferta admite una confirmación.
- **Albergues.** Crea el albergue en el panel y asigna o libera un cupo desde la ficha de la persona. Cada ficha ocupa un cupo y el panel muestra cuántos quedan disponibles.
- **Entregas.** En **Necesidades**, abre **Registrar entrega** e indica la cantidad. El sistema descuenta lo entregado del inventario y actualiza el estado a **Parcial** o **Atendida**. Las ofertas empiezan a contar para el inventario al confirmar su recepción.
- **Seguimiento.** En cada ficha puedes elegir **No se pudo contactar** o **No cumple**, escribir el motivo y guardar. Si debes revisar el caso otra vez, cambia el estado a **Pendiente**.
- **WhatsApp.** Desde una ficha con teléfono válido, abre el mensaje y envíalo en WhatsApp. Luego selecciona **Confirmar envío realizado** en el panel.

## Base de datos

Los dos scripts SQL definen el esquema de la aplicación. `basedatos/modeloentidadrelacion.mwb` conserva el modelo inicial de Workbench. Las siguientes relaciones incluyen las tablas que usa el sistema actual.

```mermaid
erDiagram
    ALBERGUES o|--o{ DAMNIFICADOS : aloja
    DAMNIFICADOS ||--o| REPORTES_AFECTACION : describe
    DAMNIFICADOS ||--o| AVISOS_WHATSAPP : recibe
    DAMNIFICADOS ||--o| SEGUIMIENTO_DAMNIFICADOS : tiene
    DAMNIFICADOS ||--o{ FOTOS_DAMNIFICADOS : adjunta
    DAMNIFICADOS ||--o{ NECESIDADES : reporta
    RECURSOS ||--o{ NECESIDADES : identifica
    RECURSOS ||--o{ OFERTAS_DONACION : identifica
    RECURSOS ||--o{ DONACIONES : identifica
    RECURSOS ||--o{ ENTREGAS : identifica
    DONANTES ||--o{ OFERTAS_DONACION : ofrece
    DONANTES o|--o{ DONACIONES : aporta
    OFERTAS_DONACION o|--o| RECEPCIONES_DONACION : origina
    DONACIONES ||--o| RECEPCIONES_DONACION : registra
    DAMNIFICADOS ||--o{ ENTREGAS : recibe
    ENTREGAS ||--o| ENTREGAS_CONFIRMADAS : registra
    NECESIDADES ||--o{ ENTREGAS_CONFIRMADAS : atiende
    CUENTAS_ADMINISTRADOR {
        int id_cuenta PK
        string usuario UK
        string clave_hash
    }
```

Las entregas históricas cuentan para el saldo del recurso. Si una persona tiene una sola necesidad para ese recurso, también cuentan para calcular su cantidad pendiente. Cuando hay varias necesidades del mismo recurso, solo se descuenta de cada una lo que se haya registrado para esa necesidad.
