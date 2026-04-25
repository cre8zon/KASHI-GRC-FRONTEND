#!/bin/bash

set -e

echo "🚀 Starting Frontend Deployment..."

# 1. Go to frontend project
cd /Users/paritoshkushwaha/Desktop/KASHI-GRC-LATEST-APP/KASHI-GRC-FRONTEND

echo "📦 Installing dependencies..."
npm install

echo "🏗️ Building project..."
npm run build

echo "🧹 Cleaning old build on server..."
ssh root@64.227.182.108 "rm -rf /var/www/react-app/dist"

echo "📤 Copying new dist folder..."
scp -r dist root@64.227.182.108:/var/www/react-app/

echo "🌐 Reloading Nginx..."
ssh root@64.227.182.108 "sudo nginx -t && sudo systemctl reload nginx"

echo "✅ Frontend Deployment Successful!"