# OFERTA DE TRABAJO FIN DE ESTUDIO ESPECÍFICO

## Datos administrativos

| Campo | Información propuesta |
| --- | --- |
| Departamento | Tecnologías de la Información y las Comunicaciones |
| Curso académico | 2025-26 |
| Fecha | 17 de mayo de 2026 |
| Título del Trabajo | GEMEROTIC: arquitectura de un constructor de gemelos digitales para ciberseguridad en redes OT/IT |
| Traducción del título a lengua inglesa | GEMEROTIC: Architecture of a Digital Twin Constructor for Cybersecurity in OT/IT Networks |
| Titulación a la que se oferta el TFE | Máster Universitario en Ingeniería de Telecomunicación de la Universidad Politécnica de Cartagena |
| Director/a del Trabajo | [Nombre y apellidos del/de la director/a] |
| Departamento del director/a | Tecnologías de la Información y las Comunicaciones |
| Codirector/a del Trabajo | [Nombre y apellidos, si procede] |
| Requisitos previos recomendables/exigibles | Conocimientos de redes TCP/IP, ciberseguridad, Python, APIs REST y sistemas Linux. Se valorarán conocimientos básicos de redes industriales OT/IT, Docker, automatización de infraestructura, desarrollo web y estándares de ciberseguridad industrial. |
| Estado | Borrador |

## 1. Objetivos

El objetivo general del Trabajo Fin de Máster es diseñar la arquitectura y establecer las bases de un constructor de gemelos digitales orientado a redes industriales OT/IT, en colaboración con AMC Global como contexto industrial de referencia. El trabajo persigue modelar topologías, generar inventario técnico, desplegar entornos de prueba y evaluar de forma trazable determinados aspectos de ciberseguridad alineados con estándares y buenas prácticas del sector.

Para alcanzar este objetivo general se plantean los siguientes objetivos específicos:

1. Analizar las necesidades de modelado, documentación y validación de ciberseguridad en redes industriales OT/IT, considerando el contexto de una empresa con infraestructuras productivas distribuidas como AMC Global.
2. Estudiar el estado del arte de los gemelos digitales aplicados a redes industriales y su relación con marcos de referencia como el modelo Purdue, ISA/IEC 62443, NIS2, NIST SP 800-82 e ISO/IEC 27001.
3. Diseñar un modelo de datos estructurado por capas que separe la infraestructura física, la conectividad lógica y la información de seguridad OT, incorporando activos, interfaces, VLAN, zonas, conductos, niveles Purdue y niveles de seguridad.
4. Implementar una interfaz de construcción visual que permita representar topologías OT/IT, editar activos y enlaces, y mantener un estado de proyecto persistente que pueda transformarse en una topología validable.
5. Integrar un mecanismo de inventario técnico basado en NetBox como repositorio derivado de equipos, conexiones y metadatos de la red, sin depender de él como fuente única operativa durante la edición del gemelo.
6. Generar artefactos reproducibles para el despliegue y validación del gemelo digital mediante herramientas de infraestructura como Containerlab, Ansible y Batfish.
7. Desarrollar una primera capa de evaluación de cumplimiento y asistencia a la auditoría que permita relacionar evidencias técnicas de la topología con controles de ciberseguridad industrial, incorporando una capa de explicación asistida por IA de forma complementaria y no sustitutiva de la validación determinista.
8. Validar el prototipo mediante escenarios representativos de redes OT/IT, documentando resultados, limitaciones, evidencias generadas y líneas de evolución hacia un producto aplicable en entornos industriales reales.

## 2. Resumen

Las redes industriales OT que soportan procesos productivos, infraestructuras críticas y sistemas de control presentan restricciones muy diferentes a las de una red IT convencional. En el caso de AMC Global, la existencia de múltiples centros de producción y de infraestructuras IT/OT relevantes para la continuidad del negocio convierte la documentación, la validación previa de cambios y la mejora continua de la ciber-resiliencia en necesidades especialmente importantes. La disponibilidad, la continuidad del proceso, la presencia de equipos heredados, la larga vida útil de los activos y la convivencia entre tecnologías industriales y sistemas IP hacen que las auditorías, pruebas de ciberseguridad o cambios de configuración deban ejecutarse con especial cautela. Una actuación directa sobre la red real puede provocar interrupciones, degradación del servicio o impactos económicos significativos.

En este contexto, el uso de gemelos digitales ofrece una vía de trabajo segura para representar, analizar y validar redes industriales sin intervenir directamente sobre la instalación productiva. Sin embargo, muchas herramientas de modelado o automatización de redes están orientadas a entornos IT o a redes de nueva generación, y no contemplan de forma natural conceptos propios de OT como zonas y conductos, niveles Purdue, activos industriales, criticidad operacional o trazabilidad respecto a estándares como ISA/IEC 62443. El presente trabajo aborda esta necesidad mediante el diseño e implementación de GEMEROTIC, una plataforma de gemelo digital enfocada en redes OT/IT.

La propuesta se centra en construir las bases de una herramienta de diseño técnico, comparable conceptualmente a un entorno tipo AutoCAD para redes OT, que permita diseñar una topología desde una interfaz visual, mantener un modelo interno estructurado y generar representaciones técnicas útiles para inventario, despliegue y validación. El modelo de datos se plantea en tres capas: una capa física para representar ubicaciones, equipos, puertos, cableado y elementos de infraestructura; una capa lógica para modelar interfaces, direccionamiento, VLAN y conectividad; y una capa de seguridad OT para incorporar zonas, conductos, niveles Purdue, niveles de seguridad y requisitos de segmentación. Esta separación facilita que el gemelo no sea solo un dibujo de red, sino una representación técnica apta para validaciones posteriores.

Uno de los elementos diferenciales del trabajo es la incorporación de NetBox como generador y repositorio de inventario enriquecido. En lugar de utilizarlo como fuente única de verdad en sentido estricto, el sistema lo emplea como una sincronización derivada del estado del proyecto, permitiendo reflejar activos, cables, interfaces y metadatos relevantes sin bloquear el trabajo de edición cuando el inventario externo no está disponible. Esta decisión busca adaptarse mejor a la realidad de muchas redes industriales, donde la documentación suele estar incompleta, dispersa o desactualizada.

El prototipo también contempla la generación de artefactos técnicos para crear laboratorios reproducibles y validar propiedades de la topología. Para ello se plantea una cadena de transformación desde el modelo GEMEROTIC hacia configuraciones, inventarios y ficheros consumibles por herramientas como Containerlab, Ansible y Batfish. Esta aproximación permite desplegar entornos controlados, automatizar configuraciones y analizar aspectos de conectividad o segmentación sin afectar a la red real.

La dimensión de ciberseguridad se aborda mediante una primera capa de evaluación de cumplimiento orientada a evidencias técnicas observables en la topología. El sistema no pretende certificar por sí mismo el cumplimiento normativo ni sustituir una auditoría formal, sino proporcionar una base trazable para identificar hallazgos, carencias y recomendaciones relacionadas con buenas prácticas y estándares de referencia. Sobre esta evaluación determinista se prevé incorporar asistencia basada en IA y técnicas RAG para facilitar la consulta, explicación y priorización de los resultados, manteniendo siempre la separación entre el motor de validación y la capa conversacional.

El resultado esperado del trabajo es un prototipo demostrable de plataforma de gemelo digital para redes OT/IT, acompañado de una memoria técnica que justifique su arquitectura, sus decisiones de diseño, su relación con los estándares estudiados y su validación mediante escenarios de prueba. El enfoque combina ingeniería de telecomunicación, ciberseguridad industrial, automatización de infraestructura y desarrollo software, con una orientación práctica hacia la reducción de riesgos y costes en el análisis de redes industriales.

## 3. Fases del Trabajo

1. Revisión del estado del arte y marco normativo. Estudio de gemelos digitales aplicados a redes industriales, arquitecturas OT/IT, modelo Purdue, ISA/IEC 62443, NIS2, NIST SP 800-82 e ISO/IEC 27001. Identificación de requisitos técnicos y de seguridad relevantes para el prototipo.
2. Análisis de requisitos y definición de casos de uso. Definición de los perfiles de usuario, alcance del prototipo, escenarios de red representativos, requisitos funcionales y no funcionales, y límites explícitos del sistema respecto a certificación, auditoría formal y operación sobre redes reales.
3. Diseño de la arquitectura de GEMEROTIC. Definición de la arquitectura general, modelo de datos por capas, flujo de información entre interfaz, API, PostgreSQL granular, NetBox, generadores de artefactos, herramientas de despliegue y módulos de validación.
4. Implementación del constructor visual y del backend. Desarrollo de la interfaz de modelado de topologías, edición de activos y enlaces, persistencia del estado de proyecto, validación de esquemas y exposición de endpoints API para operar con la topología.
5. Integración del inventario técnico. Sincronización derivada con NetBox para reflejar equipos, interfaces, cableado y metadatos relevantes de la red, manteniendo el modelo GEMEROTIC como representación operativa durante la edición y generación de artefactos.
6. Generación de laboratorios y artefactos reproducibles. Transformación de la topología en ficheros de configuración, inventarios y bundles para herramientas como Containerlab y Ansible, permitiendo reproducir escenarios de red en un entorno controlado.
7. Validación técnica y análisis de ciberseguridad. Incorporación de validaciones de conectividad, segmentación y coherencia mediante Batfish y reglas deterministas de cumplimiento técnico asociadas a controles de seguridad OT.
8. Asistencia a la auditoría y explicación de resultados. Desarrollo de una capa inicial de consulta y explicación de hallazgos, apoyada en IA/RAG cuando proceda, para facilitar la interpretación de evidencias y recomendaciones sin sustituir el criterio experto.
9. Evaluación del prototipo. Construcción de escenarios de prueba, ejecución de validaciones, análisis de resultados, capturas de la interfaz, inventario y artefactos generados, así como discusión de limitaciones y amenazas a la validez.
10. Redacción de la memoria y conclusiones. Documentación completa del trabajo, análisis crítico de las decisiones de diseño, conclusiones, impacto potencial, líneas de mejora y evolución futura del sistema.

## 4. Bibliografía

1. ISA/IEC 62443 Series of Standards. International Society of Automation. https://www.isa.org/standards-and-publications/isa-standards/isa-iec-62443-series-of-standards
2. Directiva (UE) 2022/2555 relativa a medidas destinadas a garantizar un elevado nivel común de ciberseguridad en toda la Unión, NIS2. https://eur-lex.europa.eu/eli/dir/2022/2555/oj
3. NIST SP 800-82 Rev. 3, Guide to Operational Technology (OT) Security. https://csrc.nist.gov/pubs/sp/800/82/r3/final
4. ISO/IEC 27001, Information security management systems. https://www.iso.org/standard/27001
5. NetBox Documentation. https://docs.netbox.dev/
6. Containerlab Documentation. https://containerlab.dev/
7. Batfish Documentation. https://batfish.readthedocs.io/
8. Ansible Documentation. https://docs.ansible.com/
9. Open Policy Agent Documentation. https://www.openpolicyagent.org/docs/latest/
10. FastAPI Documentation. https://fastapi.tiangolo.com/
11. React Flow Documentation. https://reactflow.dev/

## 5. Competencias

Trabajo autónomo y aplicación de conocimientos a la práctica. Capacidad para analizar, diseñar e implementar arquitecturas de comunicaciones y soluciones software aplicadas a redes OT/IT. Integración de herramientas de ciberseguridad, automatización e inventario técnico. Evaluación crítica de resultados, documentación técnica, comunicación de decisiones de ingeniería y aplicación de estándares y buenas prácticas en un problema realista de ciberseguridad industrial.

## Campos pendientes de confirmar

- Nombre completo del/de la director/a.
- Existencia o no de codirector/a.
- Curso académico definitivo si la oferta se tramita en un periodo distinto a 2025-26.
- Requisitos previos exactos que el departamento quiera marcar como recomendables o exigibles.
- Posible ajuste del título si se desea enfatizar más la parte de ciberseguridad, la de gemelo digital o la de redes industriales.
