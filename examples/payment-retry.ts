import { defineSpec } from "@model-checking/spec";

/**
 * フェーズ2の題材: 決済リクエストのタイムアウト・リトライによる二重課金。
 *
 * クライアントとサーバーの2プロセスが非同期メッセージ(inFlight / responses)で通信する。
 * クライアントはタイムアウトするとリトライするが、タイムアウトは「応答が遅い」だけで
 * リクエスト自体はサーバーに届いていることがある。サーバーが冪等性を確認せず
 * リクエストごとに課金するため、二重課金の反例が存在する。
 *
 * 複数プロセスの表現方法の検証を兼ねる:
 * - プロセスごとのローカル状態 = 状態オブジェクトのフィールド(clientPhase, attempt / charged)
 * - メッセージチャネル = 配列フィールド(inFlight, responses)
 * - どのプロセスの振る舞いかは actor メタデータで表す
 */

const MAX_ATTEMPTS = 2;

type State = {
  clientPhase: "ready" | "waiting" | "confirmed";
  /** 送信した試行回数(リトライ上限で状態空間を有界に保つ) */
  attempt: number;
  /** ネットワーク上の未達リクエスト(試行ID) */
  inFlight: number[];
  /** ネットワーク上の未達応答(試行ID) */
  responses: number[];
  /** サーバーが課金した回数 */
  charged: number;
};

export const paymentRetrySpec = defineSpec<State>({
  init: {
    clientPhase: "ready",
    attempt: 0,
    inFlight: [],
    responses: [],
    charged: 0,
  },

  actions: {
    // クライアント: 決済リクエストを送る
    sendRequest: {
      actor: "client",
      when: s => s.clientPhase === "ready" && s.attempt < MAX_ATTEMPTS,
      then: s => ({
        ...s,
        clientPhase: "waiting",
        attempt: s.attempt + 1,
        inFlight: [...s.inFlight, s.attempt + 1],
      }),
    },

    // クライアント: 応答を待ちきれずタイムアウトする(リクエストは失われていない)
    timeout: {
      actor: "client",
      when: s => s.clientPhase === "waiting" && s.attempt < MAX_ATTEMPTS,
      then: s => ({ ...s, clientPhase: "ready" }),
    },

    // クライアント: 応答を受け取る
    receiveResponse: {
      actor: "client",
      when: s => s.responses.length > 0,
      then: s => ({ ...s, clientPhase: "confirmed", responses: s.responses.slice(1) }),
    },

    // サーバー: 届いたリクエストを処理して課金し、応答を返す
    processRequest: {
      actor: "server",
      when: s => s.inFlight.length > 0,
      then: s => ({
        ...s,
        charged: s.charged + 1, // バグ: 課金済みかを確認していない(冪等でない)
        inFlight: s.inFlight.slice(1),
        responses: [...s.responses, s.inFlight[0]!],
      }),
    },
  },

  invariants: {
    // 1つの注文への課金は高々1回
    chargedAtMostOnce: s => s.charged <= 1,
  },

  // 全メッセージを処理しきって確定していれば正常終了
  accepting: s =>
    s.clientPhase === "confirmed" && s.inFlight.length === 0 && s.responses.length === 0,

  // メッセージ矢印付きシーケンス図の可視化用メタデータ(検査結果には影響しない)
  channels: {
    inFlight: { from: "client", to: "server" },
    responses: { from: "server", to: "client" },
  },
});
