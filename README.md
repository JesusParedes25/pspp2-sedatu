# PSPP v2.0 — Plataforma de Seguimiento de Proyectos Prioritarios

**SEDATU** | Uso interno | 2026

---

## Arquitectura

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  Frontend   │────▶│   Backend   │────▶│   PostgreSQL    │
│  React/Vite │     │  Express.js │     │  + PostGIS      │
│  :5173      │     │  :3000      │     │  :5432          │
└─────────────┘     └──────┬──────┘     └─────────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
              ┌─────▼─────┐ ┌────▼──────┐
              │   MinIO   │ │ GeoServer │
              │  :9000    │ │  :8080    │
              │  :9001    │ │           │
              └───────────┘ └───────────┘
```

## Requisitos

- Docker Engine 24+ y Docker Compose v2+
- Puertos libres: **5173**, **3000**, **5432**, **9000**, **9001**, **8080**

## Inicio rápido

```bash
git clone [repo] && cd pspp-v2
cp .env.example .env
# Editar .env (cambiar contraseñas)
docker-compose up --build
# Esperar ~30 segundos
docker-compose exec backend npm run seed
# Abrir http://localhost:5173
# Email: jesus.paredes@sedatu.gob.mx | Password: demo2026
```

## Variables de entorno

| Variable           | Descripción                                    | Obligatoria |
|--------------------|------------------------------------------------|:-----------:|
| `DB_NAME`          | Nombre de la base de datos PostgreSQL          | ✅          |
| `DB_USER`          | Usuario de PostgreSQL                          | ✅          |
| `DB_PASSWORD`      | Contraseña de PostgreSQL                       | ✅          |
| `JWT_SECRET`       | Secreto para firmar tokens JWT (mín. 64 chars) | ✅          |
| `JWT_EXPIRES_IN`   | Tiempo de expiración del token (ej: `8h`)      | ✅          |
| `MINIO_USER`       | Usuario administrador de MinIO                 | ✅          |
| `MINIO_PASSWORD`   | Contraseña de MinIO                            | ✅          |
| `MINIO_BUCKET`     | Nombre del bucket para evidencias              | ✅          |
| `GEOSERVER_USER`   | Usuario admin de GeoServer                     | ✅          |
| `GEOSERVER_PASSWORD` | Contraseña de GeoServer                      | ✅          |
| `SMTP_HOST`        | Servidor SMTP para correos                     | ❌          |
| `SMTP_PORT`        | Puerto SMTP (por defecto 587)                  | ❌          |
| `SMTP_USER`        | Usuario SMTP                                   | ❌          |
| `SMTP_PASSWORD`    | Contraseña SMTP                                | ❌          |
| `SMTP_FROM`        | Dirección de remitente                         | ❌          |

## Comandos útiles

```bash
# Logs en tiempo real
docker-compose logs -f backend

# Reiniciar solo un servicio
docker-compose restart backend

# Acceder a PostgreSQL
docker-compose exec postgres psql -U pspp_user -d pspp_db

# Cargar solo DGs y usuarios (sin proyectos de ejemplo)
docker-compose exec backend npm run seed:base

# Limpiar todo y empezar desde cero
docker-compose down -v && docker-compose up --build

# Generar JWT_SECRET seguro
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Despliegue en servidor SEDATU (Rocky Linux)

```bash
# Instalar Docker en Rocky Linux
sudo dnf config-manager --add-repo \
  https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli docker-compose-plugin
sudo systemctl enable --now docker

# Subir y descomprimir
scp pspp-v2.zip usuario@servidor:/opt/
cd /opt && unzip pspp-v2.zip && cd pspp-v2

# Configurar producción
cp .env.example .env.production
# Editar .env.production con valores reales

# Levantar
docker compose -f docker-compose.prod.yml --env-file .env.production up -d

# Datos iniciales
docker compose -f docker-compose.prod.yml exec backend npm run seed:base

# Build frontend
docker compose -f docker-compose.prod.yml exec frontend npm run build
# Copiar dist/ a /var/www/pspp/

# Nginx
sudo cp nginx/nginx.conf /etc/nginx/conf.d/pspp.conf
sudo nginx -t && sudo systemctl reload nginx
```

## Solución de problemas

| Problema                    | Solución                                                       |
|-----------------------------|----------------------------------------------------------------|
| Puerto ocupado              | Verificar con `netstat -tlnp` y detener el servicio conflictivo |
| Postgres no responde        | `docker-compose restart postgres` y esperar healthcheck         |
| MinIO bucket no existe      | Se crea automáticamente en el seed; o crear manualmente en :9001 |
| GeoServer sin capas         | Módulo cartográfico es segunda fase (TODO)                      |
| Token JWT expirado          | Hacer login nuevamente; ajustar `JWT_EXPIRES_IN` en `.env`      |

## Seguridad en producción

- Cambiar **TODAS** las contraseñas del `.env.example`
- `JWT_SECRET` mínimo 64 caracteres aleatorios
- Solo Nginx (80/443) expuesto al exterior
- Puertos 5432, 9000, 9001, 8080 solo accesibles internamente
