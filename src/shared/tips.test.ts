import { describe, expect, it } from "vitest";
import { tipsFrom } from "./tips";

describe("ways to tip", () => {
  it("shows nothing when no handle is set", () => {
    expect(tipsFrom({})).toEqual({ name: null, ways: [] });
  });

  it("links to each service by its handle, with or without the sign in front", () => {
    expect(tipsFrom({ TIP_NAME: "Andy", TIP_CASHAPP: "$andyd", TIP_VENMO: "andy-d_1", TIP_PAYPAL: "https://paypal.me/andyd", TIP_ZELLE: "(402) 555-0100" })).toEqual({
      name: "Andy",
      ways: [
        { service: "Cash App", handle: "$andyd", url: "https://cash.app/$andyd" },
        { service: "Venmo", handle: "@andy-d_1", url: "https://venmo.com/u/andy-d_1" },
        { service: "PayPal", handle: "paypal.me/andyd", url: "https://paypal.me/andyd" },
        { service: "Zelle", handle: "(402) 555-0100", url: null },
      ],
    });
    expect(tipsFrom({ TIP_CASHAPP: "andyd", TIP_VENMO: "@andyd1" }).ways.map((w) => w.handle)).toEqual(["$andyd", "@andyd1"]);
  });

  it("shows a PayPal or Zelle email address to send to, without a link", () => {
    expect(tipsFrom({ TIP_PAYPAL: "tips@example.com", TIP_ZELLE: "tips@example.com" }).ways).toEqual([
      { service: "PayPal", handle: "tips@example.com", url: null },
      { service: "Zelle", handle: "tips@example.com", url: null },
    ]);
  });

  it("leaves out a handle that isn't the right shape, so no link can lead somewhere else", () => {
    const odd = tipsFrom({
      TIP_NAME: "<b>Andy</b>",
      TIP_CASHAPP: "andy/../evil",
      TIP_VENMO: "a b",
      TIP_PAYPAL: "https://paypal.me.evil.example/andy",
      TIP_ZELLE: "123",
    });
    expect(odd).toEqual({ name: null, ways: [] });
    expect(tipsFrom({ TIP_PAYPAL: "javascript:alert(1)" }).ways).toEqual([]);
  });
});
