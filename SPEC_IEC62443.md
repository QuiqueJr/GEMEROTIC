# Guía Maestra de Ciberseguridad OT (ISA/IEC 62443)
*Fuente: Constructor Digital Twins IEC 62443.pdf (K-AI-TEK)*

## 1. Visión del "Constructor"
El "Constructor" es un método repetible para crear Gemelos Digitales orientados a ciberseguridad industrial. No es solo una visualización, sino una estructura de requisitos, aseguramiento y validación.

## 2. Pilares Normativos
- **ISA/IEC 62443-4-2:** Requisitos funcionales técnicos para componentes.
- **ISA/IEC 62443-4-1:** Requisitos del ciclo de vida de desarrollo de productos seguros.

## 3. Realidades de IIoT y Autoprotección
El gemelo debe modelar comportamientos de seguridad que no dependan de protecciones externas:
- Conexión directa a redes no confiables (Internet).
- Ubicaciones físicas remotas/no protegidas.
- Dispositivos de bajo costo/gran volumen.
- Funciones compartidas en el mismo hardware.

## 4. Niveles de Seguridad (Tiering)
- **Core Tier:** Basado en 62443-4-2 SL-2 (Nivel de Capacidad 2) con ajustes por exposición a Internet.
- **Advanced Tier:** Basado en SL-4 con excepciones limitadas.

## 5. Requisitos Específicos (Gaps IIoT)
El modelo debe incluir como requisitos de primer nivel:
- **Compartimentación:** Separación de entornos de ejecución.
- **Secure-by-Default:** Configuración segura de fábrica.
- **Autenticación No-Humana:** Para usuarios/procesos desde redes externas.
- **Passwords Únicos:** Por dispositivo o cambio forzado en instalación.
- **Protección de Datos en Uso.**
- **Gestión de Actualizaciones:** Remotas, con capacidad de habilitar/deshabilitar y mantenimiento de settings de usuario.

## 6. Validación y Evidencia
El Gemelo Digital debe incluir "expectativas de construcción + evidencia". La validación debe ser:
- Continua en el tiempo (alineada a 4-1).
- Basada en pruebas funcionales reales o revisión de artefactos del proveedor.
- Equivalente o superior a las mejores prácticas de IIoT aceptadas.

## 7. Implicación de Diseño para GEMEROTIC
El output de GEMEROTIC no debe ser solo una copia simulada del activo, sino que debe generar:
- Selección de requisitos 62443-4-2 aplicables por nivel (Tier).
- Requisitos adicionales de IIoT.
- Hooks de mantenimiento de seguridad (auditorías periódicas, notificaciones de actualización/retiro).
