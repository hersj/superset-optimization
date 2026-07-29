import RangeFilterPlugin from "./index";

test("renders native range controls even when the generic chart layer sees no rows", () => {
  expect(new RangeFilterPlugin().metadata.enableNoResults).toBe(false);
});
