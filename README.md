# モデル検査アプリ

## 概要

モデル検査のWEBアプリです。サポートする有限状態モデルと時相論理は以下です。

### 有限状態モデル

- オートマトン
- クリプキ構造

### 時相論理

- 計算木論理(CTL)
- 時間計算木論理(TCTL)

## Docker環境

Dockerファイル一式が準備されています。以下のコマンドで起動できます。

```shell
cd ./docker
./dockersetup.sh
docker-compose up -d --build
```

dockersetup.shではdevcontainerと同じ階層に.envをコピーしています。  
これはVisual Studio Codeの拡張機能[Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)がdocker-compose.ymlと同じ階層の.envを参照してくれない不具合があるため、その対策です。  
不要ならdockersetup.shは実行しなくても良いです。

コンテナ内のユーザーdevはdockerというグループに属させています。Windows(WSL無し)やMacで使う時はあまり意味が無いですが、Windows(WSL有り)やLinuxで起動する場合にコンテナ外からコンテナ内にマウントしたファイルを編集するために行っています。
