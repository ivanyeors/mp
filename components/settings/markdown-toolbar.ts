import {
  bold,
  codeEdit,
  codePreview,
  italic,
  link,
  orderedListCommand,
  quote,
  title,
  unorderedListCommand,
  type ICommand,
} from "@uiw/react-md-editor/commands";

// The Markdown editor's toolbar on a phone. Its full set is 18 icons and wraps
// to three rows; this keeps the formatting people use plus Edit and Preview.
// Split view and fullscreen are left out: neither works in a 360px-wide box.
// The 44px buttons and their pressed tint are in globals.css.

export const MOBILE_MD_COMMANDS: ICommand[] = [
  bold,
  italic,
  title,
  link,
  quote,
  unorderedListCommand,
  orderedListCommand,
];

export const MOBILE_MD_EXTRA_COMMANDS: ICommand[] = [codeEdit, codePreview];
