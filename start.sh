#!/bin/bash

set -e

echo "Gi verify kung mao ning latest version..."
git pull

echo "Ga install ug dependencies..."
npm install

echo "Nagsugod nang server, huwata lang..."
pm2 restart rentease || pm2 start server.js --name "rentease"

echo "Save sa PM2 process list..."
pm2 save

echo "Deploy done!"
