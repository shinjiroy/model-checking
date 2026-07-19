# DSL設計(フェーズ1)

題材の仕様を先に書き、そこからDSLのAPIとトレース形式を逆算した(DSLファースト)。実装は [packages/spec/src/](../packages/spec/src/)、題材の仕様は [examples/order-payment.ts](../examples/order-payment.ts)、挙動の仕様はテスト [packages/spec/tests/checker.test.ts](../packages/spec/tests/checker.test.ts) にある。

## 題材: 注文キャンセルと決済Webhookの競合

ECの典型的な非同期フロー。注文に対して決済をリクエストすると、決済プロバイダからWebhookが非同期に届く。ユーザーはその間もキャンセルできる。

- 検出できるバグ: **キャンセル済みの注文に対してWebhook処理が決済を確定してしまう**(キャンセルとWebhook到着の競合)。検査は「requestPayment → cancel → handleWebhook → handleWebhook」の4ステップを最短反例として返す
- この題材が良い理由: 状態機械と非同期メッセージの両方を含み、フェーズ1の範囲でタイミング依存バグが1件必ず見つかる

検査器は各状態で `when` が真のアクションを**全部**試す。`cancel` と `handleWebhook` が同時に発火可能な状態では両方の分岐を探索するので、非同期の全インターリーブが自動的に網羅される。

## DSLのAPI

### 状態

- JSONシリアライズ可能なプレーンオブジェクトに限定する(関数・クラスインスタンス・`Map`等は不可。検出すると型名入りのエラーで知らせる)。重複排除の等価性判定をキー順正規化したJSONのハッシュで行うため
- `then` は新しい状態を返す純粋関数。検査器は状態を再帰的に凍結するので、破壊的変更は例外として即座に検出される
- 状態空間はユーザーが有界に保つ(例: 二重リクエスト防止フラグでキューの伸びを止める)。無限に伸びる仕様は `maxStates` 上限で `complete: false` として打ち切られる

### アクション

```typescript
type ActionDef<S, P = unknown> = {
  actor?: string;                         // 実行主体(可視化用メタデータ。検査には無関係)
  when?: (state: S, param: P) => boolean; // 省略時は常に発火可能
  params?: (state: S) => readonly P[];    // パラメータ付き非決定性
  then: (state: S, param: P) => S;
};
```

- `params` は「いずれかの値で発火する」を表す。例: `params: s => s.users` と書けば「いずれかのユーザーが承認する」になり、検査器は全ユーザー分の分岐を試す
- 非決定性の表現はこれで全てとする。「発火可能なアクション×パラメータを検査器が全部試す」以外の仕組み(乱数・確率)は持たない

### 検査

- **不変条件**: `(state) => boolean`。時系列性質(「一度Xになったら二度とYにならない」)は状態に補助変数を足して書く(例: `wasCancelled: boolean`)。TLA+と同じ流儀
  - 不変条件に状態履歴を渡す案は不採用とした。履歴を持つと「同じ状態でも履歴が違えば別物」になり、重複排除と干渉して状態空間が膨らむため
- **デッドロック**: 発火可能なアクションが1つもない状態。`accepting` が真の状態は正常終了として除外する
- 活性(liveness)・公平性はフェーズ1では持たない(GOAL.mdの非ゴールに準拠)

## 検査結果・反例トレースの形式

検査器の出力はこの形式に固定し、可視化はこれだけを入力として独立に作る。

```typescript
type CheckResult<S> =
  | { ok: true; statesExplored: number; complete: boolean } // complete: false は maxStates による打ち切り
  | { ok: false; violation: Violation; trace: TraceStep<S>[]; statesExplored: number };

type Violation =
  | { kind: "invariant"; name: string }   // どの不変条件が破れたか
  | { kind: "deadlock" };

type TraceStep<S> = {
  action: string | null; // 発火したアクション名。初期状態はnull
  actor?: string;        // アクションを実行した主体(仕様のactorメタデータの写し)
  param?: unknown;       // paramsで選ばれた値
  state: S;              // 遷移後の状態のスナップショット
};
```

反例(`ok: false`)には、仕様の`channels`メタデータがそのまま`channels?: Record<string, { from: string; to: string }>`として写る。キーは状態のチャネルフィールド名(配列)、値はそのチャネルの送信元actor(from)・宛先actor(to)。`channels`未指定の仕様では`undefined`のままで、UIは矢印なしのタイムライン表示にフォールバックする。

- 各ステップに状態の完全なスナップショットを持つ。差分表示・一歩ずつ再生・シーケンス図はすべてUI側でこの配列から導出する
- 検査器はBFSなので、返るトレースは違反への最短経路になる(反例の読みやすさに直結する性質なので、探索順は必ずBFSとする)

### 検査のオプション

```typescript
type CheckOptions = {
  maxStates?: number;                            // 探索する状態数の上限(既定: 100万)。超えた場合はcomplete: falseで打ち切る
  onProgress?: (statesExplored: number) => void;  // 探索中に一定間隔(1024状態ごと)で呼ばれる進捗コールバック
};
```

- `onProgress` は同期的に呼ばれる。検査器自身は間引き(1024状態ごと)以上のことをせず、UIスレッドへの転送のスロットリングは呼び出し側(Web Worker上のホスト)の責務とする

## 複数プロセスの表現(フェーズ2の検証結果)

専用機構は設けず、単一の状態オブジェクト+アクションの集まりで表現する。[examples/payment-retry.ts](../examples/payment-retry.ts)(クライアント・サーバー2プロセスのタイムアウト・リトライによる二重課金)で書き味と検出力を検証済み。慣習は:

- プロセスごとのローカル状態 = 状態オブジェクトのフィールド(例: `clientPhase` / `charged`)
- メッセージチャネル = 配列フィールド(例: `inFlight` / `responses`)。末尾追加・先頭取り出しでFIFO、順序保証のないネットワークは`params`で取り出し位置を選べば表現できる
- プロセスの帰属は `actor` メタデータで表す
- どのチャネルフィールドがどの方向のメッセージかは `channels` メタデータで表す(例: [examples/payment-retry.ts](../examples/payment-retry.ts) の `inFlight`(client→server)・`responses`(server→client))。`actor` と同種の可視化専用メタデータで、検査結果には影響しない。詳細は [trace-visualization.md](trace-visualization.md)

インターリーブは「発火可能なアクションを検査器が全部試す」ことで自動的に網羅されるため、プロセス専用のAPIは不要と判断した。

## 未決事項

- `accepting` の命名。`done` / `terminal` 等、非専門家に伝わる語を再検討する
- 訪問済み集合は正規化JSON文字列の`Set`で持っている。数百万状態級では64bitフィンガープリント+TypedArrayへの置き換えが必要(GOAL.mdの性能方針)

データモデル・権限検証(フェーズ3、状態機械とは別の式木ベースのDSL)は [datamodel-sketch.md](datamodel-sketch.md) を参照。
