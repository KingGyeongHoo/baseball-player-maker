import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "BASEBALL LIFE | 나만의 야구선수 만들기",
  description: "첫 유니폼부터 드래프트까지. 나만의 선수를 키우는 고교 야구 인생 시뮬레이션."
};
export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <html lang="ko"><body>{children}</body></html>;
}
