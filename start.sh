#!/bin/bash

set -e

echo "Checking for the project's latest version..."
git pull

echo "Installing NPM dependencies..."
npm install

echo "Starting the server..."
pm2 restart rentease || pm2 start server.js --name "rentease"

echo "Saving PM2 process list..."
pm2 save

echo "Deployment Successful!"
