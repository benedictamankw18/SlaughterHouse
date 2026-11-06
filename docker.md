# Docker setup

This project uses Docker Compose to run the frontend, Node.js API, and MySQL
database together.

## Requirements

- Docker Desktop or Docker Engine with the Compose plugin.
- Ports `3000`, `3307`, and `5500` available on localhost by default.

## Configure and start

From the repository root, copy the Docker environment template and edit `.env`:

```powershell
Copy-Item .env.docker.example .env
```

Replace the example database passwords and the two signing secrets. The signing
secrets must each be at least 32 characters, must be different from each other,
and must remain stable between restarts. Keep `.env` private and do not commit
it.

Start the services and check their health:

```powershell
docker compose up --build -d
docker compose ps
docker compose logs -f backend
```

Open the frontend at <http://localhost:5500>. The API health check is at
<http://localhost:3000/api/health>, and the readiness check is at
<http://localhost:3000/api/ready>.

## Services and ports

| Service | Purpose | Host address |
|---|---|---|
| `frontend` | Static site served by Nginx | `http://localhost:5500` |
| `backend` | Node.js API | `http://localhost:3000` |
| `mysql` | MySQL 8.4 database | `127.0.0.1:3307` |

The API connects to MySQL using the private Compose network (`mysql:3306`).
Database and API ports are bound to loopback by default and are not directly
exposed on external interfaces. Change `MYSQL_PORT`, `API_PORT`, or
`FRONTEND_PORT` in `.env` if the defaults conflict with another local service.

MySQL migrations run automatically when the backend starts. Startup waits for
MySQL's health check before launching the backend, and the frontend waits for
the API health check.

## Configuration

The `.env.docker.example` file lists supported variables:

- `DB_USER`, `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`: local MySQL credentials.
- `DOWNLOAD_SIGNING_SECRET`, `CERTIFICATE_SIGNING_SECRET`: distinct persistent
  secrets needed for stable download links and certificate verification.
- `FRONTEND_ORIGIN`, `FRONTEND_ORIGINS`: trusted browser origins for API CORS.
- `API_PUBLIC_URL`, `PAYMENT_CALLBACK_URL`: externally visible API and payment
  return URLs. Update these when using a non-local domain or reverse proxy.
- `PAYSTACK_SECRET_KEY`: optional Paystack payment integration.
- `EMAIL_API_KEY`, `EMAIL_FROM`: optional transactional email delivery.
- `TRUST_PROXY`: set only when deployed behind a trusted reverse proxy; use the
  proxy hop count or trusted proxy addresses.

For production deployment, use HTTPS and a reverse proxy, expose only the
necessary public services, and provide production-specific credentials and
origins. The default loopback bindings are intended for local use.

## Manage the stack

Stop containers while preserving database and uploaded files:

```powershell
docker compose down
```

Restart:

```powershell
docker compose up -d
```

Rebuild after code or Dockerfile changes:

```powershell
docker compose up --build -d
```

Inspect status and logs:

```powershell
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 mysql
```

The named volumes `mysql-data` and `app-data` persist MySQL contents, uploads,
and generated certificates when containers are recreated. Back up these data
separately before upgrades or other maintenance. To permanently delete all
Compose-managed database and file data, run:

```powershell
docker compose down --volumes
```

This last command is destructive and removes the persisted database and uploads.
