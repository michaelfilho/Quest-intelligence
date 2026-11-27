# Execução local

Requer Node 24.7+ e um PostgreSQL **local e descartável** (nunca o da VPS).

```bash
npm run setup
```

1. Crie o banco e as roles (como superusuário local):
   ```bash
   psql -d postgres -c "CREATE DATABASE quest_rinne"
   psql -d postgres -v db=quest_rinne -v migrator_password=<m> -v app_password=<a> -v reader_password=<r> -f server/db/bootstrap.sql
   ```
2. No `.env` da raiz (não versionado): `DATABASE_URL` (`qi_reader`), `APP_DATABASE_URL` (`qi_app`) e `COOKIE_SECURE=false`.
3. Migrations e administrador:
   ```bash
   MIGRATION_DATABASE_URL=postgres://qi_migrator:<m>@127.0.0.1:5432/quest_rinne npm run db:migrate
   npm --prefix server run user:admin -- <usuario> "Nome"
   ```
4. Suba:
   ```bash
   npm run dev:api   # http://127.0.0.1:3333
   npm run dev:web   # http://localhost:5173
   ```

Sem preparar um banco, `npm run homologacao` cria um PostgreSQL temporário, executa a navegação e o descarta.
