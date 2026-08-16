import { hello } from "./mod.ts";

Deno.test("hello returns its greeting", () => {
  if (hello() !== "Hello, World!") {
    throw new Error("unexpected greeting");
  }
});
