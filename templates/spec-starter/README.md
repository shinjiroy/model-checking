# spec-starter

`@model-checking/spec` で設計を検査するプロジェクトの雛形。このディレクトリをコピーして使う。

```bash
cp -r templates/spec-starter my-design && cd my-design
npm install
npm run typecheck   # 仕様の型チェック
npm run check       # 検査(反例が出たら落ちる)
```

## 中身

| パス | 役割 |
| --- | --- |
| [specs/withdraw.ts](specs/withdraw.ts) | 仕様。ここを自分の設計に置き換える |
| [specs/withdraw.check.test.ts](specs/withdraw.check.test.ts) | 検査をCIのゲートにするテスト。仕様を足したらケースを足す |
| [tsconfig.json](tsconfig.json) | 仕様を書くときの型設定(`strict` + `noUncheckedIndexedAccess`) |
| [.github/workflows/ci.yml](.github/workflows/ci.yml) | 型チェックと検査をCIで回す |

## 検査が効いていることを確かめる

`specs/withdraw.ts` の `withdrawA` から「引き落とし直前の残高再確認」を外す。

```typescript
withdrawA: {
  actor: "処理A",
  when: s => s.checkedA && !s.doneA,
  then: s => ({ ...s, balance: s.balance - AMOUNT, doneA: true }),
},
```

`npm run check` が落ち、`checkA → checkB → withdrawA → withdrawB` の順で残高が -20 になる反例がログに出る。

## ブラウザで反例を見る

このディレクトリの `.ts` をSPAにドラッグ&ドロップすると、反例をタイムラインと状態差分で読める。仕様の書き方は [チュートリアル](https://github.com/shinjiroy/model-checking/blob/main/docs/tutorial.md) を参照。

型チェックはブラウザ側では行われない(トランスパイルのみ)。型エラーは手元のエディタとCIで捕まえる。
