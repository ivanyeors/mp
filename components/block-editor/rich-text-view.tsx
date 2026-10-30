"use client";

import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { RichTextRun, RichTextValue, RichTextVariable } from "./rich-text-doc";
import { RICH_TEXT_BOX, RICH_TEXT_EMPTY, VARIABLE_CHIP } from "./rich-text-style";

/**
 * `RichText`'s words as they read, not editable (PRD-campaign-email-editor
 * slice 04): on the server, before TipTap loads, and while the input is
 * read-only. It looks as the editor does, so one never jumps to the other.
 */

function RunView({ run, variables }: { run: RichTextRun; variables: readonly RichTextVariable[] }) {
  if ("var" in run) {
    const v = variables.find((x) => x.key === run.var);
    return (
      <span className={VARIABLE_CHIP} title={v?.description}>
        {v?.label ?? `{${run.var}}`}
      </span>
    );
  }
  let out: ReactNode = run.text.split("\n").flatMap((line, i) => (i ? [<br key={`b${i}`} />, line] : [line]));
  if (run.italic) out = <em>{out}</em>;
  if (run.bold) out = <strong>{out}</strong>;
  if (run.href) out = <span className="underline underline-offset-2">{out}</span>;
  return <>{out}</>;
}

const Runs = ({ runs, variables }: { runs: readonly RichTextRun[]; variables: readonly RichTextVariable[] }) => (
  <>
    {runs.map((r, i) => (
      <RunView key={i} run={r} variables={variables} />
    ))}
  </>
);

/**
 * The words inline, each Variable its chip, paragraphs and items a space
 * apart: a line of the page that quotes them (an Email template's original
 * words, slice 14), not an input.
 */
export function RichTextInline({ value, variables = [] }: { value: RichTextValue; variables?: readonly RichTextVariable[] }) {
  return (
    <>
      {value.map((p, i) => (
        <Fragment key={i}>
          {i ? " " : null}
          <Runs runs={p.kind === "p" ? p.runs : p.items.flatMap((item, j) => (j ? [{ text: " " }, ...item] : item))} variables={variables} />
        </Fragment>
      ))}
    </>
  );
}

export function RichTextView({
  value,
  variables = [],
  placeholder,
  singleLine = false,
  className,
  id,
  readOnly = false,
  ...aria
}: {
  value: RichTextValue;
  /** Fixed for good (sending has started), not only waiting for the editor. */
  readOnly?: boolean;
  variables?: readonly RichTextVariable[];
  placeholder?: string;
  /** One line, as the editor's `singleLine`: the same height, and said so. */
  singleLine?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <div
      id={id}
      role="textbox"
      aria-readonly="true"
      aria-multiline={singleLine ? "false" : "true"}
      {...aria}
      className={cn(RICH_TEXT_BOX, singleLine && "min-h-9", readOnly && "bg-muted/30", className)}
    >
      {value.length ? (
        value.map((p, i) =>
          p.kind === "p" ? (
            <p key={i}>
              <Runs runs={p.runs} variables={variables} />
            </p>
          ) : (
            <ul key={i}>
              {p.items.map((item, j) => (
                <li key={j}>
                  <Runs runs={item} variables={variables} />
                </li>
              ))}
            </ul>
          ),
        )
      ) : (
        <p className={RICH_TEXT_EMPTY} data-placeholder={placeholder ?? ""} />
      )}
    </div>
  );
}

