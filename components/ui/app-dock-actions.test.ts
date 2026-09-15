import { describe, expect, it } from "vitest";
import { Plus } from "lucide-react";
import { toolsFor } from "./app-dock-actions";

const actions = [{ id: "add", title: "Add", icon: Plus, onClick: () => {} }];
const tools = { scope: "/settings/product-builder/rules-engine", actions };

describe("toolsFor", () => {
  it("shows tools on the scope and every page under it (so flow switches don't collapse the dock)", () => {
    expect(toolsFor(tools, "/settings/product-builder/rules-engine")).toBe(actions);
    expect(toolsFor(tools, "/settings/product-builder/rules-engine/mbolster")).toBe(actions);
  });

  it("hides them everywhere else, including look-alike prefixes", () => {
    expect(toolsFor(tools, "/settings/costings")).toEqual([]);
    expect(toolsFor(tools, "/settings/product-builder/rules-engine-old")).toEqual([]);
    expect(toolsFor({ scope: "", actions }, "/settings")).toEqual([]);
  });
});
