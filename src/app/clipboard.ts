/** クリップボードのテキストを読む（「貼り付け」ボタン。Q13） */
export async function readClipboardText(): Promise<string> {
  return navigator.clipboard.readText();
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/**
 * HTML をリッチテキスト（text/html）として、ソースを text/plain として同時に書き込む（Q36 リッチコピー）。
 * navigator.clipboard.write の text/html は Chrome がページの文書で無害化のためにパースし、
 * style 属性ごとに CSP（style-src 'self'）違反を出すため、copy イベントの clipboardData に文字列のまま渡す
 */
export async function copyRichHtml(html: string): Promise<void> {
  let written = false;
  const onCopy = (event: ClipboardEvent): void => {
    if (!event.clipboardData) return;
    event.clipboardData.setData("text/html", html);
    event.clipboardData.setData("text/plain", html);
    event.preventDefault();
    written = true;
  };
  document.addEventListener("copy", onCopy);
  try {
    document.execCommand("copy");
  } finally {
    document.removeEventListener("copy", onCopy);
  }
  if (!written) throw new Error("クリップボードに書き込めませんでした");
}
