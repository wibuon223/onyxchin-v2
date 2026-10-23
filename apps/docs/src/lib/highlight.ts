/** Hand-rolled JSON tokenizer that emits DOM spans. No innerHTML, no deps. */

export function jsonText(value: unknown): string {
  const text = JSON.stringify(value, null, 2);
  return text === undefined ? "null" : text;
}

type TokenClass = "tok-key" | "tok-str" | "tok-num" | "tok-lit" | "tok-punc";

function token(cls: TokenClass, text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = cls;
  span.textContent = text;
  return span;
}

export function highlightJson(pre: HTMLElement, source: string): void {
  pre.textContent = "";
  const frag = document.createDocumentFragment();
  const len = source.length;
  let i = 0;

  while (i < len) {
    const ch = source.charAt(i);

    if (ch === '"') {
      let j = i + 1;
      while (j < len) {
        const c = source.charAt(j);
        if (c === "\\") {
          j += 2;
          continue;
        }
        if (c === '"') {
          j += 1;
          break;
        }
        j += 1;
      }
      const raw = source.slice(i, j);
      let k = j;
      while (k < len && /\s/.test(source.charAt(k))) k += 1;
      frag.appendChild(token(source.charAt(k) === ":" ? "tok-key" : "tok-str", raw));
      i = j;
      continue;
    }

    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      let j = i + 1;
      while (j < len && /[0-9eE+\-.]/.test(source.charAt(j))) j += 1;
      frag.appendChild(token("tok-num", source.slice(i, j)));
      i = j;
      continue;
    }

    if (/^true|^false|^null/.test(source.slice(i, i + 5))) {
      const literal = /^(true|false|null)/.exec(source.slice(i));
      if (literal) {
        frag.appendChild(token("tok-lit", literal[1]));
        i += literal[1].length;
        continue;
      }
    }

    if (/[{}[\],:]/.test(ch)) {
      frag.appendChild(token("tok-punc", ch));
      i += 1;
      continue;
    }

    frag.appendChild(document.createTextNode(ch));
    i += 1;
  }

  pre.appendChild(frag);
}
