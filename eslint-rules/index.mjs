// The local `mp` ESLint plugin: rules this repo enforces that no published
// plugin does. Registered in eslint.config.mjs, which also scopes each rule.

import noComment from "./no-comment.mjs";
import noEffect from "./no-effect.mjs";

const plugin = {
  meta: { name: "mp" },
  rules: {
    "no-comment": noComment,
    "no-effect": noEffect,
  },
};

export default plugin;
