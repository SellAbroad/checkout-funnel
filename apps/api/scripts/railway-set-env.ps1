# Run from: apps/api (PowerShell)
# 1) railway login
# 2) railway link   (select project + the API service)
# 3) Cole a DATABASE_URL completa do Railway (Postgres -> Variables). Use aspas simples se a senha tiver $.
#    .\scripts\railway-set-env.ps1

# Aspas simples: evita que caracteres $ na senha quebrem o PowerShell
$DATABASE_URL = 'postgresql://postgres:SUA_SENHA@HOST:PORTA/railway'
$PORT = '3100'
$CORS_ORIGIN = '*'

# Railway CLI: KEY=valor num unico argumento
railway variables set "DATABASE_URL=$DATABASE_URL"
railway variables set "PORT=$PORT"
railway variables set "CORS_ORIGIN=$CORS_ORIGIN"

Write-Host "Done. railway variables"
railway variables
