#!/bin/bash

cd /var/www/${FRAMEWORK_DIR_NAME}/

echo プロジェクトの初期設定を開始します。

echo ファイルの権限設定
# chown dev:docker -R ./
# chmod 775 -R ./
chmod 777 -R ./storage/logs

echo composer install...
composer install

echo プロジェクトの初期設定が終了しました。
