import { describe, expect, test } from "vitest";
import { detectMessageArrows, formatMessageArrow } from "../src/core/messageArrows.js";

const channels = {
  inFlight: { from: "client", to: "server" },
  responses: { from: "server", to: "client" },
};

describe("detectMessageArrows: 配列長の増減からメッセージの送受信を判定する", () => {
  test("チャネルの配列長が増えていれば送信(send)", () => {
    const prev = { inFlight: [], responses: [] };
    const next = { inFlight: [1], responses: [] };
    expect(detectMessageArrows(prev, next, channels)).toEqual([
      { field: "inFlight", from: "client", to: "server", kind: "send" },
    ]);
  });

  test("チャネルの配列長が減っていれば受信(receive)", () => {
    const prev = { inFlight: [1], responses: [] };
    const next = { inFlight: [], responses: [] };
    expect(detectMessageArrows(prev, next, channels)).toEqual([
      { field: "inFlight", from: "client", to: "server", kind: "receive" },
    ]);
  });

  test("配列長が変わらなければ変化なし", () => {
    const prev = { inFlight: [1], responses: [] };
    const next = { inFlight: [1], responses: [] };
    expect(detectMessageArrows(prev, next, channels)).toEqual([]);
  });

  test("複数チャネルが同時に変化すればそれぞれの矢印を返す", () => {
    const prev = { inFlight: [1], responses: [] };
    const next = { inFlight: [], responses: [1] };
    expect(detectMessageArrows(prev, next, channels)).toEqual([
      { field: "inFlight", from: "client", to: "server", kind: "receive" },
      { field: "responses", from: "server", to: "client", kind: "send" },
    ]);
  });

  test("channels未指定なら常に空配列", () => {
    const prev = { inFlight: [] };
    const next = { inFlight: [1] };
    expect(detectMessageArrows(prev, next, undefined)).toEqual([]);
  });

  test("初期ステップ(prevStateがundefined)は空配列", () => {
    expect(detectMessageArrows(undefined, { inFlight: [1] }, channels)).toEqual([]);
  });

  test("状態がプレーンオブジェクトでなければ空配列", () => {
    expect(detectMessageArrows(1, 2, channels)).toEqual([]);
  });
});

describe("formatMessageArrow: 矢印を1行の注釈テキストにする", () => {
  test("「▶ from→to: field」の形式になる", () => {
    expect(formatMessageArrow({ field: "inFlight", from: "client", to: "server", kind: "send" })).toBe(
      "▶ client→server: inFlight",
    );
  });
});
