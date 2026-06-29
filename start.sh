#!/bin/bash

set -e  # Exit immediately if any command fails

echo " Pulling latest changes..."
git pull

echo " Installing dependencies..."
npm install

echo " Starting server..."
npm run start