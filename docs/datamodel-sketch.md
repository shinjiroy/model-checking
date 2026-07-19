# データモデル・権限検証(フェーズ3)設計

状態機械側(`packages/spec/src/spec.ts`・`checker.ts`)とは別に、`packages/spec/src/datamodel/`が
データモデル・権限モデルの検証(GOAL.mdの検証対象「データモデル・権限」)を担う。実装は
[packages/spec/src/datamodel/](../packages/spec/src/datamodel/)、題材の仕様は
[examples/doc-permission.ts](../examples/doc-permission.ts)、挙動の仕様はテスト
[packages/spec/tests/datamodel-formula.test.ts](../packages/spec/tests/datamodel-formula.test.ts)・
[packages/spec/tests/datamodel-engine.test.ts](../packages/spec/tests/datamodel-engine.test.ts)・
[packages/spec/tests/doc-permission.test.ts](../packages/spec/tests/doc-permission.test.ts)にある。

## 題材: ドキュメント共有の権限モデル

「ドキュメントを共有されたユーザーには編集権も渡る」という設計が、「編集できるのはオーナーか管理者のみ」
という意図した性質を破っていないかを検証する。sharedWith経由で編集権を得たユーザーが、オーナーでも
管理者でもないという反例が見つかる。これは権限モデルの抜け漏れの典型例で、コードレビューでは
見落としやすい(「共有先に編集権を渡す」という設計判断の副作用に気づきにくい)。examples/doc-permission.ts
のscopeはUser: 2, Doc: 1だが、これは反例を示すのに必要な最小値ではない(User: 1, Doc: 1でも同じ反例が
見つかる)。複数ユーザーが存在する、より一般的な状況でも同じ抜け漏れが起きることを示すためにUser: 2にしている。

## なぜboolean関数ではなく式木(Formula)なのか

GOAL.mdの技術方針より:

> データモデル側(フェーズ3)の述語はコンビネータ(`forall`/`exists`/`eq`等)の式木で書く。boolean関数は
> SMT式に翻訳できないため、全列挙とZ3の両方で解釈できるASTを挟み、仕様を書き換えずにエンジンを差し替え
> 可能にする

状態機械側(`ActionDef.when`等)は素のTS関数(実行して評価するだけ)で十分だったが、データモデル側は
将来Z3(SMTソルバ)による検証への差し替えを見込んでいる。SMTソルバは述語を論理式として受け取る必要があり、
「任意のJS関数」からその構造(量化・論理結合子・関係)を復元することはできない(JS関数は不透明な計算そのもの
であり、構文木として取り出せない)。そこで、述語をコンビネータで組み立てさせることで、結果を
JSONシリアライズ可能なASTとして得る。このASTは全列挙エンジンでもZ3エンジンでも同じように解釈できるため、
モデル定義(`ModelDef`)を書き換えることなく検査エンジンだけを差し替えられる。

## API

```typescript
type ModelDef = {
  sorts: readonly string[];                       // 有限スコープで列挙する集合(例: "User", "Doc")
  relations: Record<string, readonly string[]>;   // 関係名 → 引数のソート列(例: owner: ["User","Doc"])
  constraints?: Record<string, Formula>;           // 前提。この制約を満たすインスタンスだけを検証対象の設計として扱う
  assertions: Record<string, Formula>;             // 検証したい性質。前提の下で破れないことを確認する
  scope: Record<string, number>;                   // 各ソートの既定要素数(小スコープ)
};

function defineModel(def: ModelDef): ModelDef; // defineSpecと同様の恒等関数。構築時にFormula木を検証する
```

- `defineSpec`と同じく「プレーンオブジェクトを受け取ってそのまま返す」形にしている。違いは、`defineModel`が
  呼び出し時に式木を検証すること(未知のソート・関係名、引数の数・ソート不一致は日本語エラーで即座に知らせる)
- `constraints`は「この設計はこう振る舞う」という前提(例: canEditの定義)、`assertions`は「この前提の下でも
  破れてほしくない性質」を分けて書く。前提を満たさないインスタンスは検証対象から除外される(小スコープ全列挙の
  「制約充足+性質検証」という定石)

## 式木(Formula/Term)の語彙と設計判断

```typescript
type Term = { kind: "var"; id: number; sort: string };

type Formula =
  | { kind: "forall"; sort: string; varId: number; body: Formula }
  | { kind: "exists"; sort: string; varId: number; body: Formula }
  | { kind: "rel"; name: string; args: readonly Term[] }
  | { kind: "eq"; left: Term; right: Term }
  | { kind: "neq"; left: Term; right: Term }
  | { kind: "and"; operands: readonly Formula[] }
  | { kind: "or"; operands: readonly Formula[] }
  | { kind: "not"; operand: Formula }
  | { kind: "implies"; left: Formula; right: Formula }
  | { kind: "iff"; left: Formula; right: Formula };
```

コンビネータ: `forall(sort, x => body)` / `exists(sort, x => body)` / `rel(name, ...terms)` / `eq` / `neq` /
`and` / `or` / `not` / `implies` / `iff`。

- **変数の内部表現**: de Bruijn指数ではなく、束縛(`forall`/`exists`の呼び出し)のたびに一意なidを振る方式を
  採った。コールバックへ渡す`Term`にそのidが埋め込まれており、コールバックが組み立てた式(`body`)をそのまま
  ASTへ格納するだけでよく、指数の付け替え計算が要らない。結果のASTはid・ソート名だけを持つプレーンオブジェクト
  になり、「JSONシリアライズ可能」という要件を満たす
- **タグ付きユニオン**: 各ノードは`kind`で判別できる。将来算術(`+`/`<`等)や集合演算を足す場合も、
  ユニオンにケースを追加し、評価器・(将来の)Z3翻訳器にそのケースのハンドラを足すだけで拡張できる。
  既存のノード形は変更しなくてよい
- **現在の語彙の範囲**: 量化・等値・関係・論理結合子のみ。算術(`+`/`<`/`<=`等)や集合の濃度制約は未収載。
  Z3の表現力とはこの語彙の範囲でおおよそ一致させており、語彙を広げるとZ3翻訳できないノードが混ざるリスクが
  上がるため、必要になった時点で慎重に拡張する方針とする

## エンジンインターフェース(Z3差し替え可能の要)

```typescript
type Instance = {
  atoms: Record<string, readonly string[]>;                    // ソート → 原子名(例 User: ["User0","User1"])
  relations: Record<string, readonly (readonly string[])[]>;   // 関係 → タプル集合
};

type ModelCheckResult =
  | { ok: true; instancesChecked: number; complete: boolean; satisfiedInstances: number }
  | { ok: false; assertion: string; instance: Instance; instancesChecked: number };

type ModelCheckOptions = {
  scope?: Record<string, number>;
  maxInstances?: number;
  onProgress?: (n: number) => void;
};

interface ModelEngine {
  findViolation(model: ModelDef, options?: ModelCheckOptions): ModelCheckResult;
}

function checkModel(model: ModelDef, options?: ModelCheckOptions): ModelCheckResult; // 既定エンジン(全列挙)のファサード
```

- `ModelEngine`はモデル(`ModelDef`)とオプションを受け取り、`ModelCheckResult`を返す1メソッドのインターフェース。
  現状の実装は`enumerationEngine`(全列挙)のみだが、将来Z3ベースのエンジンを同じインターフェースで実装し、
  `checkModel`が使うエンジンを差し替えるだけで済むようにしてある。式木(Formula)自体はエンジンに依存しない共通の
  中間表現なので、モデル定義側は一切変更が要らない
- `Instance`は反例(またはチェック対象)の1つの解釈。ソートごとの原子名一覧と、関係ごとの実際のタプル集合を持つ。
  可視化(apps/web)はこの形をそのまま「ソートごとの原子一覧」「関係ごとのタプルの表」として描画する
- `satisfiedInstances`(ok: true側のみ): `instancesChecked`件のうちconstraintsを満たした(=実際にassertionsの
  検証対象になった)インスタンス数。`ok: true`かつ`satisfiedInstances: 0`は「constraints自体が矛盾していて、
  充足可能なインスタンスが1つもなかった」ことを意味し、この場合assertionsは実質的に一度も検証されていない。
  `ok: true`単体では「性質を確認できた」のか「制約が強すぎて何も検証できなかった」のかを区別できないため、
  UI側はこの値が0のとき「制約を満たすインスタンスが存在しないため、性質は検証されていません」と警告する

## 全列挙エンジン(enumerationEngine)の実装方針

各関係が取りうるタプル全体(引数ソートの直積)の**部分集合**を、関係ごとに独立に選んでインスタンスを作る。
全関係の部分集合の組み合わせ数(2^タプル数、を関係ごとに掛け合わせたもの)だけインスタンスがあり、これを
`maxInstances`まで決定的な順序(関係名の列挙順・各関係のタプル列挙順を固定した、混合基数のカウンタ)で列挙する。
`constraints`を全て満たし`assertions`のいずれかを破る最初のインスタンスが見つかればそれを返し
(`instance`に破れた具体例が入る)、`maxInstances`に達しても見つからなければ`complete: false`で打ち切る。
評価器(`evalFormula`)はASTを素直に再帰評価するだけの実装で、量化は該当ソートの全原子への`every`/`some`、
関係所属はタプル集合への線形探索で行う。

小スコープの全列挙は関係の数・スコープに対して指数的に組み合わせが増えるため(GOAL.mdの非ゴール
「大規模状態空間の検査」を参照)、実運用ではUser:2〜3・Doc:1〜2程度の小さいスコープを想定している。
