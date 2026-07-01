#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

npm install
npm run build
npm start
