#!/bin/bash

cd /var/www/${FRAMEWORK_DIR_NAME}/

echo プロジェクトの初期設定を開始します。

echo composer install...
composer install --dev

echo .envファイル作成
cp .env.example .env

echo アプリケーションキー生成
php artisan key:generate --force

echo ファイルの権限設定
# chown dev:docker -R ./
# chmod 775 -R ./
chmod 777 -R ./storage/logs
chmod 777 -R ./storage/framework

echo autoload の更新
composer dump-autoload

echo プロジェクトの初期設定が終了しました。
