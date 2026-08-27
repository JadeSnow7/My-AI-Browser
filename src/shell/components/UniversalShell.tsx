import React, { useEffect, useMemo, useRef } from "react";
import {
  GROUP_ORDER,
  GROUP_PREFIX,
  INTENT_LABEL,
  buildResults,
  intentOf,
  nextIntent,
  type ResultGroup,
  type Segment,
  type ShellContext,
  type ShellResult,
} from "../state/intent";

/**
 * One box for navigate, search, ask, command and shell.
 *
 * This replaces the separate address bar and command palette. Two boxes meant
 * the user had to know which one owned a thought before having it; one box
 * plus a visible intent chip means the box classifies and shows its work.
 *
 * It is the Shell's only routinely-modal surface, so it raises the Shell above
 * the page views and swallows page input for its lifetime -- which is what a
 * modal wants, and why nothing else here is allowed to float.
 */
export function UniversalShell({
  query,
  onQuery,
  selected,
  onSelected,
  onClose,
  context,
}: {
  query: string;
  onQuery: (value: string) => void;
  selected: number;
  onSelected: (index: number) => void;
  onClose: () => void;
  context: Omit<ShellContext, "query">;
}): React.JSX.Element {
  const input = useRef<HTMLInputElement>(null);
  const intent = intentOf(query);
  const results = useMemo(
    () => buildResults({ ...context, query }),
    [context, query],
  );

  useEffect(() => {
    input.current?.focus();
  }, []);

  const index = results.length === 0 ? 0 : Math.min(selected, results.length - 1);

  const run = (result: ShellResult | undefined): void => {
    if (!result) return;
    result.run();
    onClose();
  };

  /**
   * Tab changes how the sentence executes without changing the sentence. The
   * prefix is rewritten in place so the chip and the text can never disagree.
   */
  const cycleIntent = (): void => {
    const body = query.replace(/^[>/?@]\s*/, "");
    const target = nextIntent(intent);
    const prefix =
      target === "shell"
        ? ">"
        : target === "command"
          ? "/"
          : target === "ask"
            ? "?"
            : "";
    onQuery(prefix + body);
    onSelected(0);
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "Tab") {
      event.preventDefault();
      cycleIntent();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (results.length) onSelected((index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length)
        onSelected((index + results.length - 1) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(results[index]);
    }
  };

  const groups = GROUP_ORDER.filter((group) =>
    results.some((result) => result.group === group),
  );

  return (
    <div className="ushell" role="dialog" aria-label="Universal Shell">
      <div className="ushell-input">
        <span className={`intent-chip intent-${intent}`}>
          {INTENT_LABEL[intent]}
        </span>
        <input
          ref={input}
          value={query}
          spellCheck={false}
          placeholder="Search, navigate, ask, or run a command…"
          onChange={(event) => {
            onQuery(event.target.value);
            onSelected(0);
          }}
          onKeyDown={onKeyDown}
        />
        <span className="ushell-key">⌘K</span>
      </div>

      <div className="ushell-results">
        {groups.map((group) => (
          <ResultSection
            key={group}
            group={group}
            results={results}
            all={results}
            selectedId={results[index]?.id}
            onHover={(result) =>
              onSelected(results.findIndex((r) => r.id === result.id))
            }
            onRun={run}
          />
        ))}
        {results.length === 0 && (
          <p className="ushell-empty">Nothing matches — ⇥ to change intent.</p>
        )}
      </div>

      <footer className="ushell-hints">
        <span>
          <b>tab</b> change intent · <b>↑↓</b> move · <b>⏎</b> run
        </span>
        <span>groups never reorder</span>
      </footer>
    </div>
  );
}

function ResultSection({
  group,
  results,
  selectedId,
  onHover,
  onRun,
}: {
  group: ResultGroup;
  results: ShellResult[];
  all: ShellResult[];
  selectedId: string | undefined;
  onHover: (result: ShellResult) => void;
  onRun: (result: ShellResult) => void;
}): React.JSX.Element {
  const prefix = GROUP_PREFIX[group];
  return (
    <>
      <p className="ushell-group">
        {group}
        {prefix && <span className="ushell-group-prefix">— prefix {prefix}</span>}
      </p>
      {results
        .filter((result) => result.group === group)
        .map((result) => (
          <button
            key={result.id}
            className={
              result.id === selectedId ? "ushell-row selected" : "ushell-row"
            }
            onMouseMove={() => onHover(result)}
            onClick={() => onRun(result)}
          >
            <span className="ushell-glyph">{result.glyph}</span>
            <span className="ushell-label">
              {result.label.map((segment: Segment, i: number) => (
                <span key={i} className={segment.tone && `seg-${segment.tone}`}>
                  {segment.text}
                </span>
              ))}
            </span>
            <span
              className={
                result.acts ? "ushell-consequence acts" : "ushell-consequence"
              }
            >
              {result.consequence}
            </span>
          </button>
        ))}
    </>
  );
}
