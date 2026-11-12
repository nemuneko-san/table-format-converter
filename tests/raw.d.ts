// Vite の ?raw インポート（ファイル内容を文字列として読み込む）の型宣言
declare module "*.html?raw" {
  const content: string;
  export default content;
}
