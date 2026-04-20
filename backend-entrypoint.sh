#!/bin/sh
set -e
python backend/manage.py migrate --noinput
exec "$@"
