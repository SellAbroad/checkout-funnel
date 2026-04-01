#!/usr/bin/env bash
# Run from: apps/api
# 1) railway login
# 2) railway link
# 3) Edit values below, then: bash scripts/railway-set-env.sh

export DATABASE_URL='postgresql://postgres:SUA_SENHA_AQUI@hopper.proxy.rlwy.net:10913/railway'
export PORT='3100'
export CORS_ORIGIN='*'

# Railway CLI exige KEY=valor (um argumento), nao KEY e valor separados
railway variables set "DATABASE_URL=$DATABASE_URL"
railway variables set "PORT=$PORT"
railway variables set "CORS_ORIGIN=$CORS_ORIGIN"

echo "Done. Check: railway variables"
