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
