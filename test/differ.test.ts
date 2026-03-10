import { describe, it, expect } from "vitest";
import { findNewItems } from "../src/differ";

describe("findNewItems", () => {
  it("returns items not in existing set", () => {
    const parsed = [
      { title: "Article A", url: "https://example.com/a" },
      { title: "Article B", url: "https://example.com/b" },
      { title: "Article C", url: "https://example.com/c" },
    ];
    const existing = new Set(["article a", "article b"]);
    const newItems = findNewItems(parsed, existing);
    expect(newItems).toHaveLength(1);
    expect(newItems[0].title).toBe("Article C");
  });

  it("returns all items when no existing", () => {
    const parsed = [{ title: "Article A" }, { title: "Article B" }];
    const newItems = findNewItems(parsed, new Set());
    expect(newItems).toHaveLength(2);
  });

  it("returns empty when all exist", () => {
    const parsed = [{ title: "Article A" }];
    const existing = new Set(["article a"]);
    expect(findNewItems(parsed, existing)).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    const parsed = [{ title: "ARTICLE A" }];
    const existing = new Set(["article a"]);
    expect(findNewItems(parsed, existing)).toHaveLength(0);
  });
});
