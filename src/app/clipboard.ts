/** クリップボードのテキストを読む（「貼り付け」ボタン。Q13） */
export async function readClipboardText(): Promise<string> {
  return navigator.clipboard.readText();
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

/** HTML をリッチテキスト（text/html）として、ソースを text/plain として同時に書き込む（Q36 リッチコピー） */
export async function copyRichHtml(html: string): Promise<void> {
  const item = new ClipboardItem({
    "text/html": new Blob([html], { type: "text/html" }),
    "text/plain": new Blob([html], { type: "text/plain" }),
  });
  await navigator.clipboard.write([item]);
}
