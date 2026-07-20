# @model-checking/spec

設計を状態機械またはデータモデルとして書き、反例を探すためのTypeScript DSLと検査器。ブラウザ・Nodeのどちらでも動く(DOM・Node固有APIに依存しない)。

```bash
npm install -D @model-checking/spec
```

## 状態機械の検査

「状態」「アクション」「不変条件」を書くと、初期状態から到達できる状態を幅優先で全部たどり、不変条件が破れる最短の手順を反例として返す。各状態で発火できるアクションを全部試すので、並行して動くものの順序が自動的に網羅される。

```typescript
import { check, defineSpec } from "@model-checking/spec";

const spec = defineSpec<{ balance: number; checked: boolean; done: boolean }>({
  init: { balance: 100, checked: false, done: false },
  actions: {
    check: { when: s => !s.checked, then: s => ({ ...s, checked: true }) },
    withdraw: {
      when: s => s.checked && !s.done,
      then: s => ({ ...s, balance: s.balance - 60, done: true }),
    },
  },
  invariants: { balanceNeverNegative: s => s.balance >= 0 },
  done: s => s.done,
});

const result = check(spec);
if (!result.ok) {
  console.log(result.violation, result.trace);
}
```

- 状態はJSONにできるプレーンオブジェクトに限る(`Map`・`Set`・クラスインスタンス・関数は不可)
- `then` は純粋関数。検査器は状態を凍結するので破壊的変更は例外になる
- 状態空間は利用者が有界に保つ。上限(既定100万状態)を超えると `complete: false` で打ち切られる

## データモデルの検査

権限モデルのような「時間で変わらない構造」は制約充足として書き、小スコープで全インスタンスを列挙して assertion を破るインスタンスを探す。

```typescript
import { checkModel, defineModel, forall, implies, or, rel } from "@model-checking/spec";
```

## 主なexport

| 種別 | 名前 |
| --- | --- |
| 状態機械 | `defineSpec` / `check` |
| 状態機械の型 | `Spec` / `ActionDef` / `ChannelDef` / `CheckResult` / `CheckOptions` / `TraceStep` / `Violation` |
| データモデル | `defineModel` / `checkModel` / `enumerationEngine` |
| 論理式 | `forall` / `exists` / `rel` / `eq` / `neq` / `and` / `or` / `not` / `implies` / `iff` |
| 数値式 | `lit` / `card` / `count` / `add` / `lt` / `le` / `gt` / `ge` |
| データモデルの型 | `ModelDef` / `Formula` / `Term` / `IntExpr` / `Instance` / `ModelCheckResult` / `ModelCheckOptions` / `ModelEngine` |

## ドキュメント

- [チュートリアル](https://github.com/shinjiroy/model-checking/blob/main/docs/tutorial.md) — 最初の1仕様を書いて検査するまで
- [DSLリファレンス(状態機械)](https://github.com/shinjiroy/model-checking/blob/main/docs/dsl-sketch.md)
- [DSLリファレンス(データモデル)](https://github.com/shinjiroy/model-checking/blob/main/docs/datamodel-sketch.md)
- [プロジェクトの雛形](https://github.com/shinjiroy/model-checking/tree/main/templates/spec-starter)

反例をタイムラインと状態差分で読むためのSPAが同じリポジトリにある。仕様の `.ts` をドラッグ&ドロップすると、ブラウザ内で検査して可視化する(仕様は外部に送信されない)。
